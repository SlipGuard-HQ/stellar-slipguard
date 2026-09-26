#![no_std]

//! # SlipGuard Mock Token
//!
//! A minimal, self-contained SEP-41 token used by the SlipGuard test suite
//! in place of the Stellar Asset Contract. It implements
//! [`soroban_sdk::token::TokenInterface`] exactly, so the router can drive it
//! through the standard [`soroban_sdk::token::TokenClient`].
//!
//! It is intentionally simple: instance storage for metadata, persistent
//! storage for balances and allowances, and an admin-gated `mint` for test
//! funding. Do not deploy this on mainnet as a real asset.

use soroban_sdk::{
    contract, contractimpl, contracttype, token::TokenInterface, Address, Env, MuxedAddress, String,
};

const LEDGERS_PER_DAY: u32 = 17_280;
const TTL_THRESHOLD: u32 = 30 * LEDGERS_PER_DAY;
const TTL_EXTEND_TO: u32 = 90 * LEDGERS_PER_DAY;

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    Decimals,
    Name,
    Symbol,
    Balance(Address),
    Allowance(Address, Address),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AllowanceData {
    pub amount: i128,
    pub expiration_ledger: u32,
}

#[contract]
pub struct MockToken;

#[contractimpl]
impl MockToken {
    /// Configure token metadata once. The admin authorizes the call.
    pub fn initialize(env: Env, admin: Address, decimals: u32, name: String, symbol: String) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Decimals, &decimals);
        env.storage().instance().set(&DataKey::Name, &name);
        env.storage().instance().set(&DataKey::Symbol, &symbol);
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
    }

    /// Test-only faucet. Authorized by the token admin.
    pub fn mint(env: Env, to: Address, amount: i128) {
        let admin = read_admin(&env);
        admin.require_auth();
        if amount < 0 {
            panic!("negative mint");
        }
        let balance = read_balance(&env, &to);
        write_balance(&env, &to, balance + amount);
    }

    /// The admin configured at initialization.
    pub fn admin(env: Env) -> Address {
        read_admin(&env)
    }
}

#[contractimpl]
impl TokenInterface for MockToken {
    fn allowance(env: Env, from: Address, spender: Address) -> i128 {
        let allowance = read_allowance(&env, &from, &spender);
        if allowance.expiration_ledger > env.ledger().sequence() {
            allowance.amount
        } else {
            0
        }
    }

    fn approve(env: Env, from: Address, spender: Address, amount: i128, expiration_ledger: u32) {
        from.require_auth();
        if amount < 0 {
            panic!("negative allowance");
        }
        if amount > 0 && expiration_ledger < env.ledger().sequence() {
            panic!("expiration ledger in the past");
        }
        write_allowance(
            &env,
            &from,
            &spender,
            AllowanceData {
                amount,
                expiration_ledger,
            },
        );
    }

    fn balance(env: Env, id: Address) -> i128 {
        read_balance(&env, &id)
    }

    fn transfer(env: Env, from: Address, to: MuxedAddress, amount: i128) {
        from.require_auth();
        if amount < 0 {
            panic!("negative transfer");
        }
        move_balance(&env, &from, &to.address(), amount);
    }

    fn transfer_from(env: Env, spender: Address, from: Address, to: Address, amount: i128) {
        spender.require_auth();
        if amount < 0 {
            panic!("negative transfer");
        }
        spend_allowance(&env, &from, &spender, amount);
        move_balance(&env, &from, &to, amount);
    }

    fn burn(env: Env, from: Address, amount: i128) {
        from.require_auth();
        if amount < 0 {
            panic!("negative burn");
        }
        let balance = read_balance(&env, &from);
        if balance < amount {
            panic!("insufficient balance");
        }
        write_balance(&env, &from, balance - amount);
    }

    fn burn_from(env: Env, spender: Address, from: Address, amount: i128) {
        spender.require_auth();
        if amount < 0 {
            panic!("negative burn");
        }
        spend_allowance(&env, &from, &spender, amount);
        let balance = read_balance(&env, &from);
        if balance < amount {
            panic!("insufficient balance");
        }
        write_balance(&env, &from, balance - amount);
    }

    fn decimals(env: Env) -> u32 {
        match env.storage().instance().get(&DataKey::Decimals) {
            Some(decimals) => decimals,
            None => panic!("token not initialized"),
        }
    }

    fn name(env: Env) -> String {
        match env.storage().instance().get(&DataKey::Name) {
            Some(name) => name,
            None => panic!("token not initialized"),
        }
    }

    fn symbol(env: Env) -> String {
        match env.storage().instance().get(&DataKey::Symbol) {
            Some(symbol) => symbol,
            None => panic!("token not initialized"),
        }
    }
}

fn read_admin(env: &Env) -> Address {
    match env.storage().instance().get(&DataKey::Admin) {
        Some(admin) => admin,
        None => panic!("token not initialized"),
    }
}

fn read_balance(env: &Env, id: &Address) -> i128 {
    env.storage()
        .persistent()
        .get(&DataKey::Balance(id.clone()))
        .unwrap_or(0)
}

fn write_balance(env: &Env, id: &Address, amount: i128) {
    let key = DataKey::Balance(id.clone());
    env.storage().persistent().set(&key, &amount);
    env.storage()
        .persistent()
        .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
}

fn move_balance(env: &Env, from: &Address, to: &Address, amount: i128) {
    let from_balance = read_balance(env, from);
    if from_balance < amount {
        panic!("insufficient balance");
    }
    write_balance(env, from, from_balance - amount);
    write_balance(env, to, read_balance(env, to) + amount);
}

fn read_allowance(env: &Env, from: &Address, spender: &Address) -> AllowanceData {
    env.storage()
        .persistent()
        .get(&DataKey::Allowance(from.clone(), spender.clone()))
        .unwrap_or(AllowanceData {
            amount: 0,
            expiration_ledger: 0,
        })
}

fn write_allowance(env: &Env, from: &Address, spender: &Address, data: AllowanceData) {
    let key = DataKey::Allowance(from.clone(), spender.clone());
    env.storage().persistent().set(&key, &data);
    env.storage()
        .persistent()
        .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
}

fn spend_allowance(env: &Env, from: &Address, spender: &Address, amount: i128) {
    let allowance = read_allowance(env, from, spender);
    let unexpired = allowance.expiration_ledger > env.ledger().sequence();
    let spendable = if unexpired { allowance.amount } else { 0 };
    if spendable < amount {
        panic!("insufficient allowance");
    }
    write_allowance(
        env,
        from,
        spender,
        AllowanceData {
            amount: spendable - amount,
            expiration_ledger: allowance.expiration_ledger,
        },
    );
}
