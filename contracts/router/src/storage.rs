use soroban_sdk::{contracttype, Address, BytesN, Env};

use crate::types::{FillReceipt, IntentStatus};

/// Ledgers are expected to close roughly every five seconds.
const LEDGERS_PER_DAY: u32 = 17_280;
/// Extend an entry once it falls below this many ledgers of remaining life.
const TTL_THRESHOLD: u32 = 30 * LEDGERS_PER_DAY;
/// Extend entries out to roughly this many ledgers.
const TTL_EXTEND_TO: u32 = 90 * LEDGERS_PER_DAY;

/// Every piece of router state is addressed by one of these keys.
#[contracttype]
pub enum DataKey {
    /// Protocol admin, stored in instance storage.
    Admin,
    /// Lifecycle of an intent, keyed by its hash.
    IntentStatus(BytesN<32>),
    /// Settlement receipt, keyed by the intent hash.
    FillReceipt(BytesN<32>),
    /// Single-use nonce marker, keyed by `(trader, nonce)`.
    UsedNonce(Address, u64),
}

/// Returns the configured admin, or `None` when `init` has not run.
pub fn get_admin(env: &Env) -> Option<Address> {
    env.storage().instance().get(&DataKey::Admin)
}

/// Records the protocol admin. Instance storage is bumped on write.
pub fn set_admin(env: &Env, admin: &Address) {
    env.storage().instance().set(&DataKey::Admin, admin);
    env.storage()
        .instance()
        .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
}

/// Whether `init` has already been called.
pub fn has_admin(env: &Env) -> bool {
    env.storage().instance().has(&DataKey::Admin)
}

/// Reads the lifecycle of an intent. Unknown intents are `Active`.
pub fn get_intent_status(env: &Env, intent_hash: &BytesN<32>) -> IntentStatus {
    let key = DataKey::IntentStatus(intent_hash.clone());
    env.storage()
        .persistent()
        .get(&key)
        .unwrap_or(IntentStatus::Active)
}

/// Persists the lifecycle of an intent and extends its TTL.
pub fn set_intent_status(env: &Env, intent_hash: &BytesN<32>, status: &IntentStatus) {
    let key = DataKey::IntentStatus(intent_hash.clone());
    env.storage().persistent().set(&key, status);
    env.storage()
        .persistent()
        .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
}

/// Reads a settlement receipt, if the intent was filled.
pub fn get_fill_receipt(env: &Env, intent_hash: &BytesN<32>) -> Option<FillReceipt> {
    let key = DataKey::FillReceipt(intent_hash.clone());
    let receipt = env.storage().persistent().get(&key);
    if receipt.is_some() {
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
    }
    receipt
}

/// Persists a settlement receipt and extends its TTL.
pub fn set_fill_receipt(env: &Env, intent_hash: &BytesN<32>, receipt: &FillReceipt) {
    let key = DataKey::FillReceipt(intent_hash.clone());
    env.storage().persistent().set(&key, receipt);
    env.storage()
        .persistent()
        .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
}

/// Whether `(trader, nonce)` has already been consumed.
pub fn is_nonce_used(env: &Env, trader: &Address, nonce: u64) -> bool {
    env.storage()
        .persistent()
        .get(&DataKey::UsedNonce(trader.clone(), nonce))
        .unwrap_or(false)
}

/// Consumes `(trader, nonce)` so the intent can never fill or cancel twice.
pub fn set_nonce_used(env: &Env, trader: &Address, nonce: u64) {
    let key = DataKey::UsedNonce(trader.clone(), nonce);
    env.storage().persistent().set(&key, &true);
    env.storage()
        .persistent()
        .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
}
