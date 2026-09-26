use soroban_sdk::contracterror;

/// Errors returned by `SlipGuardRouter`.
///
/// Values `1..=7` are the canonical protocol errors. `8..=10` are input
/// validation guards that keep the settlement math well-formed.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum SlipGuardError {
    /// `env.ledger().timestamp()` is greater than `intent.deadline`.
    IntentExpired = 1,
    /// The solver delivered less than `intent.min_buy_amount`.
    InsufficientOutput = 2,
    /// The trader's net proceeds fell further below `min_buy_amount` than
    /// `max_slippage_bps` allows.
    SlippageExceeded = 3,
    /// The caller is not allowed to act on behalf of the intent's trader.
    UnauthorizedTrader = 4,
    /// The intent nonce has already been consumed by a fill or cancellation.
    NonceAlreadyUsed = 5,
    /// The intent is not in `IntentStatus::Active`.
    IntentNotActive = 6,
    /// A checked arithmetic operation overflowed.
    MathOverflow = 7,
    /// A basis-point value is greater than 10_000.
    InvalidSlippageBps = 8,
    /// `sell_amount` or `min_buy_amount` is not strictly positive.
    InvalidAmount = 9,
    /// `init` was called on an already initialized router.
    AlreadyInitialized = 10,
}
