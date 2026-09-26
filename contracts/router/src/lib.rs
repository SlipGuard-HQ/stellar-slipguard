#![no_std]

//! # SlipGuard Router
//!
//! Non-custodial settlement for intent-based conditional orders on Stellar.
//!
//! A trader signs a [`TraderIntent`] off-chain. Any solver may fill it by
//! calling [`SlipGuardRouter::execute_intent`], which atomically swaps the
//! trader's `sell_token` for the solver's `buy_token`, enforces the trader's
//! price floor and slippage tolerance, and writes a [`FillReceipt`].
//!
//! Fund movement is explicit and symmetric: nothing leaves the trader's
//! balance until a fill succeeds, and the trader's signature is required for
//! the pull. There is no escrow and no ERC-20 style allowance.

use soroban_sdk::{
    contract, contractevent, contractimpl, token::TokenClient, xdr::ToXdr, Address, BytesN, Env,
    MuxedAddress,
};

mod errors;
mod storage;
mod types;

#[cfg(test)]
mod test;

pub use errors::SlipGuardError;
pub use types::{FillReceipt, IntentStatus, TraderIntent};

use errors::SlipGuardError::{
    AlreadyInitialized, InsufficientOutput, IntentExpired, IntentNotActive, InvalidAmount,
    InvalidSlippageBps, MathOverflow, NonceAlreadyUsed, SlippageExceeded, UnauthorizedTrader,
};

/// Basis points denominator. 100 bps == 1%.
const BPS_DENOMINATOR: i128 = 10_000;

/// Emitted once by [`SlipGuardRouter::init`].
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Initialized {
    /// The admin configured at deployment.
    #[topic]
    pub admin: Address,
}

/// Emitted when a trader withdraws an intent.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct IntentCancelled {
    /// The intent's owner.
    #[topic]
    pub trader: Address,
    /// Hash of the cancelled intent.
    pub intent_hash: BytesN<32>,
}

/// Emitted when a solver settles an intent.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct IntentFilled {
    /// The intent's owner.
    #[topic]
    pub trader: Address,
    /// Hash of the filled intent.
    pub intent_hash: BytesN<32>,
    /// The solver that executed the fill.
    pub solver: Address,
    /// Amount of `buy_token` delivered to the trader.
    pub trader_proceeds: i128,
    /// Amount of `buy_token` retained by the solver.
    pub solver_fee: i128,
    /// Ledger timestamp of settlement.
    pub timestamp: u64,
}

#[contract]
pub struct SlipGuardRouter;

#[contractimpl]
impl SlipGuardRouter {
    /// Configure the protocol admin once at deployment.
    ///
    /// The admin authorizes the call, so the deployment transaction cannot be
    /// front-run by an unrelated party.
    pub fn init(env: Env, admin: Address) -> Result<(), SlipGuardError> {
        if storage::has_admin(&env) {
            return Err(AlreadyInitialized);
        }
        admin.require_auth();
        storage::set_admin(&env, &admin);
        Initialized { admin }.publish(&env);
        Ok(())
    }

    /// Deterministic SHA-256 hash of a [`TraderIntent`].
    ///
    /// The intent is serialized to its canonical `ScVal` XDR form and hashed.
    /// Off-chain users can reproduce this value; see `@slipguard/sdk`.
    pub fn get_intent_hash(env: Env, intent: TraderIntent) -> BytesN<32> {
        let bytes = intent.to_xdr(&env);
        env.crypto().sha256(&bytes).to_bytes()
    }

    /// Withdraw an intent before any solver fills it.
    ///
    /// Authorized by `intent.trader`. Cancelling consumes the nonce, so the
    /// same intent can never be filled afterwards.
    pub fn cancel_intent(env: Env, intent: TraderIntent) -> Result<(), SlipGuardError> {
        intent.trader.require_auth();

        let intent_hash = Self::get_intent_hash(env.clone(), intent.clone());

        if storage::get_intent_status(&env, &intent_hash) != IntentStatus::Active {
            return Err(IntentNotActive);
        }
        if storage::is_nonce_used(&env, &intent.trader, intent.nonce) {
            return Err(NonceAlreadyUsed);
        }

        storage::set_intent_status(&env, &intent_hash, &IntentStatus::Cancelled);
        storage::set_nonce_used(&env, &intent.trader, intent.nonce);

        IntentCancelled {
            trader: intent.trader.clone(),
            intent_hash,
        }
        .publish(&env);
        Ok(())
    }

    /// Atomically settle an intent.
    ///
    /// Both the solver executing the fill and the trader who owns the intent
    /// must authorize the call. The trader's authorization binds these exact
    /// intent parameters, so a solver cannot substitute a cheaper order.
    ///
    /// Settlement order follows checks-effects-interactions: intent state is
    /// committed before any token transfer, so a hostile token cannot re-enter
    /// and double-fill the order.
    pub fn execute_intent(
        env: Env,
        solver: Address,
        intent: TraderIntent,
        actual_buy_amount: i128,
    ) -> Result<FillReceipt, SlipGuardError> {
        solver.require_auth();

        // A trader cannot fill their own intent, so this is rejected before the
        // trader's authorization is consumed.
        if solver == intent.trader {
            return Err(UnauthorizedTrader);
        }

        intent.trader.require_auth();

        if intent.sell_amount <= 0 || intent.min_buy_amount <= 0 {
            return Err(InvalidAmount);
        }
        if intent.max_slippage_bps > BPS_DENOMINATOR as u32
            || intent.solver_fee_bps > BPS_DENOMINATOR as u32
        {
            return Err(InvalidSlippageBps);
        }

        let now = env.ledger().timestamp();
        if now > intent.deadline {
            return Err(IntentExpired);
        }
        if actual_buy_amount < intent.min_buy_amount {
            return Err(InsufficientOutput);
        }

        let intent_hash = Self::get_intent_hash(env.clone(), intent.clone());

        if storage::get_intent_status(&env, &intent_hash) != IntentStatus::Active {
            return Err(IntentNotActive);
        }
        if storage::is_nonce_used(&env, &intent.trader, intent.nonce) {
            return Err(NonceAlreadyUsed);
        }

        // Split the fill between the trader's net proceeds and the solver fee,
        // then confirm the net stays inside the trader's slippage tolerance.
        let solver_fee = mul_bps(actual_buy_amount, intent.solver_fee_bps)?;
        let trader_proceeds = actual_buy_amount
            .checked_sub(solver_fee)
            .ok_or(MathOverflow)?;

        if trader_proceeds < intent.min_buy_amount {
            let shortfall = intent
                .min_buy_amount
                .checked_sub(trader_proceeds)
                .ok_or(MathOverflow)?;
            let shortfall_bps = shortfall
                .checked_mul(BPS_DENOMINATOR)
                .ok_or(MathOverflow)?
                .checked_div(intent.min_buy_amount)
                .ok_or(MathOverflow)?;
            if shortfall_bps > intent.max_slippage_bps as i128 {
                return Err(SlippageExceeded);
            }
        }

        // Effects first.
        storage::set_intent_status(&env, &intent_hash, &IntentStatus::Filled);
        storage::set_nonce_used(&env, &intent.trader, intent.nonce);

        let router = env.current_contract_address();
        let sell = TokenClient::new(&env, &intent.sell_token);
        let buy = TokenClient::new(&env, &intent.buy_token);

        // Pull the trader's sell amount to the solver under the trader's
        // authorization, then settle the buy side out of the solver's balance.
        sell.transfer(
            &intent.trader,
            MuxedAddress::from(&solver),
            &intent.sell_amount,
        );
        buy.transfer(&solver, MuxedAddress::from(&router), &actual_buy_amount);
        buy.transfer(
            &router,
            MuxedAddress::from(&intent.trader),
            &trader_proceeds,
        );
        if solver_fee > 0 {
            buy.transfer(&router, MuxedAddress::from(&solver), &solver_fee);
        }

        let receipt = FillReceipt {
            intent_hash: intent_hash.clone(),
            solver: solver.clone(),
            bought_amount: actual_buy_amount,
            timestamp: now,
        };
        storage::set_fill_receipt(&env, &intent_hash, &receipt);

        IntentFilled {
            trader: intent.trader.clone(),
            intent_hash,
            solver,
            trader_proceeds,
            solver_fee,
            timestamp: now,
        }
        .publish(&env);

        Ok(receipt)
    }

    /// Lifecycle status of an intent, keyed by its hash.
    pub fn get_intent_status(env: Env, intent_hash: BytesN<32>) -> IntentStatus {
        storage::get_intent_status(&env, &intent_hash)
    }

    /// Settlement receipt for a filled intent.
    pub fn get_fill_receipt(env: Env, intent_hash: BytesN<32>) -> Option<FillReceipt> {
        storage::get_fill_receipt(&env, &intent_hash)
    }

    /// Whether `(trader, nonce)` has been consumed by a fill or cancellation.
    pub fn is_nonce_used(env: Env, trader: Address, nonce: u64) -> bool {
        storage::is_nonce_used(&env, &trader, nonce)
    }

    /// The protocol admin set by [`SlipGuardRouter::init`].
    pub fn get_admin(env: Env) -> Option<Address> {
        storage::get_admin(&env)
    }
}

/// `amount * bps / 10_000` with checked arithmetic.
fn mul_bps(amount: i128, bps: u32) -> Result<i128, SlipGuardError> {
    let scaled = amount.checked_mul(bps as i128).ok_or(MathOverflow)?;
    scaled.checked_div(BPS_DENOMINATOR).ok_or(MathOverflow)
}
