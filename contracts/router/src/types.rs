use soroban_sdk::{contracttype, Address, BytesN};

/// Lifecycle of a trader intent.
///
/// Active (0), Filled (1), Cancelled (2), Expired (3).
#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum IntentStatus {
    /// Broadcast and fillable.
    Active = 0,
    /// Settled by a solver; a fill receipt exists.
    Filled = 1,
    /// Withdrawn by the trader.
    Cancelled = 2,
    /// Deadline passed. Derived, never persisted.
    Expired = 3,
}

/// A signed, off-chain conditional order.
///
/// The full struct is hashed with `Keccak`-style determinism: the router
/// serializes it to XDR (an `ScVal` map with sorted symbol keys) and takes
/// SHA-256. Off-chain SDKs must reproduce the exact same encoding.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TraderIntent {
    /// The account authorizing the sell side of this intent.
    pub trader: Address,
    /// Token the trader sells. Pulled from `trader` only at fill time.
    pub sell_token: Address,
    /// Token the trader buys. Provided by the solver at fill time.
    pub buy_token: Address,
    /// Exact amount of `sell_token` moved to the solver on fill.
    pub sell_amount: i128,
    /// Gross amount of `buy_token` the solver must deliver.
    pub min_buy_amount: i128,
    /// Maximum shortfall, in basis points, the trader tolerates between
    /// `min_buy_amount` and their net proceeds after the solver fee.
    pub max_slippage_bps: u32,
    /// Unix timestamp (seconds) after which the intent can no longer fill.
    pub deadline: u64,
    /// Per-trader, single-use nonce preventing replay.
    pub nonce: u64,
    /// Fee, in basis points of the filled amount, retained by the solver.
    pub solver_fee_bps: u32,
}

/// Proof of settlement, written on a successful fill.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FillReceipt {
    /// SHA-256 hash of the filled intent.
    pub intent_hash: BytesN<32>,
    /// The solver that executed the intent.
    pub solver: Address,
    /// Gross `buy_token` amount delivered by the solver.
    pub bought_amount: i128,
    /// Ledger timestamp of settlement.
    pub timestamp: u64,
}
