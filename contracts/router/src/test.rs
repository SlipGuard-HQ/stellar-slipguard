use soroban_sdk::{
    testutils::{Address as _, Ledger as _},
    Address, BytesN, ConversionError, Env, InvokeError, String,
};

use slipguard_mock_token::{MockToken, MockTokenClient};

use crate::{IntentStatus, SlipGuardError, SlipGuardRouter, SlipGuardRouterClient, TraderIntent};

const SELL_AMOUNT: i128 = 1_000_000;
const MIN_BUY_AMOUNT: i128 = 1_000_000;
const START_TIMESTAMP: u64 = 1_000;
const DEFAULT_DEADLINE: u64 = 2_000;
const DEFAULT_NONCE: u64 = 1;

/// Everything a test needs: the router, two mock tokens and three actors.
struct Fixture<'a> {
    admin: Address,
    trader: Address,
    solver: Address,
    router: SlipGuardRouterClient<'a>,
    sell: MockTokenClient<'a>,
    buy: MockTokenClient<'a>,
}

fn deploy_token<'a>(
    env: &'a Env,
    admin: &Address,
    decimals: u32,
    name: &str,
    symbol: &str,
) -> MockTokenClient<'a> {
    let token_id = env.register(MockToken, ());
    let token = MockTokenClient::new(env, &token_id);
    token.initialize(
        admin,
        &decimals,
        &String::from_str(env, name),
        &String::from_str(env, symbol),
    );
    token
}

fn setup(env: &Env) -> Fixture<'_> {
    env.mock_all_auths();
    env.ledger().set_timestamp(START_TIMESTAMP);

    let admin = Address::generate(env);
    let trader = Address::generate(env);
    let solver = Address::generate(env);

    let router_id = env.register(SlipGuardRouter, ());
    let router = SlipGuardRouterClient::new(env, &router_id);
    router.init(&admin);

    let sell = deploy_token(env, &admin, 7, "Stellar Lumens", "XLM");
    let buy = deploy_token(env, &admin, 6, "USD Coin", "USDC");

    // Fund the trader with the sell token and the solver with the buy token.
    sell.mint(&trader, &(SELL_AMOUNT * 10));
    buy.mint(&solver, &(MIN_BUY_AMOUNT * 10));

    Fixture {
        admin,
        trader,
        solver,
        router,
        sell,
        buy,
    }
}

fn sample_intent(
    trader: &Address,
    sell_token: &Address,
    buy_token: &Address,
    nonce: u64,
) -> TraderIntent {
    TraderIntent {
        trader: trader.clone(),
        sell_token: sell_token.clone(),
        buy_token: buy_token.clone(),
        sell_amount: SELL_AMOUNT,
        min_buy_amount: MIN_BUY_AMOUNT,
        max_slippage_bps: 100,
        deadline: DEFAULT_DEADLINE,
        nonce,
        solver_fee_bps: 50,
    }
}

/// Asserts that `result` carries the given contract error.
fn assert_contract_error<T>(
    result: Result<Result<T, ConversionError>, Result<SlipGuardError, InvokeError>>,
    expected: SlipGuardError,
) where
    T: core::fmt::Debug,
{
    match result {
        Err(Ok(error)) => assert_eq!(error, expected),
        other => panic!("expected contract error {expected:?}, got {other:?}"),
    }
}

fn hex_to_bytes32(hex: &str) -> [u8; 32] {
    assert_eq!(hex.len(), 64, "expected a 32-byte hex string");
    let raw = hex.as_bytes();
    let mut out = [0u8; 32];
    for (i, byte) in out.iter_mut().enumerate() {
        let hi = (raw[i * 2] as char).to_digit(16).expect("valid hex") as u8;
        let lo = (raw[i * 2 + 1] as char).to_digit(16).expect("valid hex") as u8;
        *byte = (hi << 4) | lo;
    }
    out
}

/// Cross-language encoding check.
///
/// The expected hash is produced by `@slipguard/sdk` from these exact fields
/// (`hashIntent` in `packages/sdk/src/tests/intent.test.ts`). If this test ever
/// fails, the Rust and TypeScript encodings have diverged and both sides must be
/// changed together.
#[test]
fn test_intent_hash_matches_sdk_reference_vector() {
    let env = Env::default();

    let intent = TraderIntent {
        trader: Address::from_str(
            &env,
            "GCFIRY65OQE7DFP5KLNS2PF2LVZMUZYJX4OZIEQ36N2IQANUB5XVYOJR",
        ),
        sell_token: Address::from_str(
            &env,
            "GCATS5YOVB6ROX2WUNKGNQ2MP3GMXDMKSG2O4N5CLX3A6W4PZGZZI55U",
        ),
        buy_token: Address::from_str(
            &env,
            "GDWUSKGGFDI4FRXK5EBTRECZSVQSSWJHHJOGH6JWG3AUMFFMQ435DIAG",
        ),
        sell_amount: 10_000_000,
        min_buy_amount: 9_500_000,
        max_slippage_bps: 50,
        deadline: 1_800_000_600,
        nonce: 1,
        solver_fee_bps: 0,
    };

    let hash = SlipGuardRouter::get_intent_hash(env.clone(), intent);
    let expected =
        hex_to_bytes32("5a1b7ff38e7cd7484e8336dfd9685dbfbc2203509cea6686486edbfb85860ee5");

    assert_eq!(hash, BytesN::from_array(&env, &expected));
}

#[test]
fn test_init_configures_admin() {
    let env = Env::default();
    let fixture = setup(&env);

    assert_eq!(fixture.router.get_admin(), Some(fixture.admin.clone()));
}

#[test]
fn test_init_rejects_second_call() {
    let env = Env::default();
    let fixture = setup(&env);

    assert_contract_error(
        fixture.router.try_init(&fixture.admin),
        SlipGuardError::AlreadyInitialized,
    );
}

#[test]
fn test_get_intent_hash_is_deterministic() {
    let env = Env::default();
    let fixture = setup(&env);

    let intent = sample_intent(
        &fixture.trader,
        &fixture.sell.address,
        &fixture.buy.address,
        DEFAULT_NONCE,
    );
    let same = sample_intent(
        &fixture.trader,
        &fixture.sell.address,
        &fixture.buy.address,
        DEFAULT_NONCE,
    );

    assert_eq!(
        fixture.router.get_intent_hash(&intent),
        fixture.router.get_intent_hash(&same)
    );

    let mut tweaked = same;
    tweaked.sell_amount += 1;
    assert_ne!(
        fixture.router.get_intent_hash(&intent),
        fixture.router.get_intent_hash(&tweaked)
    );
}

#[test]
fn test_execute_intent_happy_path() {
    let env = Env::default();
    let fixture = setup(&env);

    let intent = sample_intent(
        &fixture.trader,
        &fixture.sell.address,
        &fixture.buy.address,
        DEFAULT_NONCE,
    );

    let receipt = fixture
        .router
        .execute_intent(&fixture.solver, &intent, &MIN_BUY_AMOUNT);

    // 50 bps of 1_000_000 is retained by the solver.
    let expected_fee = 5_000;
    let expected_proceeds = MIN_BUY_AMOUNT - expected_fee;

    assert_eq!(receipt.solver, fixture.solver);
    assert_eq!(receipt.bought_amount, MIN_BUY_AMOUNT);
    assert_eq!(receipt.timestamp, START_TIMESTAMP);

    assert_eq!(fixture.sell.balance(&fixture.solver), SELL_AMOUNT);
    assert_eq!(fixture.sell.balance(&fixture.trader), SELL_AMOUNT * 9);
    assert_eq!(fixture.buy.balance(&fixture.trader), expected_proceeds);
    assert_eq!(
        fixture.buy.balance(&fixture.solver),
        MIN_BUY_AMOUNT * 9 + expected_fee
    );

    assert_eq!(
        fixture.router.get_intent_status(&receipt.intent_hash),
        IntentStatus::Filled
    );
    assert!(fixture
        .router
        .get_fill_receipt(&receipt.intent_hash)
        .is_some());
    assert!(fixture
        .router
        .is_nonce_used(&fixture.trader, &DEFAULT_NONCE));
}

#[test]
fn test_execute_intent_with_zero_fee_transfers_everything() {
    let env = Env::default();
    let fixture = setup(&env);

    let mut intent = sample_intent(
        &fixture.trader,
        &fixture.sell.address,
        &fixture.buy.address,
        DEFAULT_NONCE,
    );
    intent.solver_fee_bps = 0;

    fixture
        .router
        .execute_intent(&fixture.solver, &intent, &MIN_BUY_AMOUNT);

    assert_eq!(fixture.buy.balance(&fixture.trader), MIN_BUY_AMOUNT);
    assert_eq!(fixture.buy.balance(&fixture.solver), MIN_BUY_AMOUNT * 9);
}

#[test]
fn test_execute_intent_over_delivery_favors_trader() {
    let env = Env::default();
    let fixture = setup(&env);

    let intent = sample_intent(
        &fixture.trader,
        &fixture.sell.address,
        &fixture.buy.address,
        DEFAULT_NONCE,
    );

    let actual_buy_amount = MIN_BUY_AMOUNT + 100_000;
    fixture
        .router
        .execute_intent(&fixture.solver, &intent, &actual_buy_amount);

    let expected_fee = 5_500;
    assert_eq!(
        fixture.buy.balance(&fixture.trader),
        actual_buy_amount - expected_fee
    );
}

#[test]
fn test_execute_intent_reverts_when_expired() {
    let env = Env::default();
    let fixture = setup(&env);

    let intent = sample_intent(
        &fixture.trader,
        &fixture.sell.address,
        &fixture.buy.address,
        DEFAULT_NONCE,
    );

    env.ledger().set_timestamp(DEFAULT_DEADLINE + 1);

    assert_contract_error(
        fixture
            .router
            .try_execute_intent(&fixture.solver, &intent, &MIN_BUY_AMOUNT),
        SlipGuardError::IntentExpired,
    );
    assert_eq!(
        fixture.sell.balance(&fixture.solver),
        0,
        "no tokens may move on a rejected fill"
    );
}

#[test]
fn test_execute_intent_reverts_on_insufficient_output() {
    let env = Env::default();
    let fixture = setup(&env);

    let intent = sample_intent(
        &fixture.trader,
        &fixture.sell.address,
        &fixture.buy.address,
        DEFAULT_NONCE,
    );

    assert_contract_error(
        fixture
            .router
            .try_execute_intent(&fixture.solver, &intent, &(MIN_BUY_AMOUNT - 1)),
        SlipGuardError::InsufficientOutput,
    );
}

#[test]
fn test_execute_intent_reverts_when_slippage_exceeds_tolerance() {
    let env = Env::default();
    let fixture = setup(&env);

    let mut intent = sample_intent(
        &fixture.trader,
        &fixture.sell.address,
        &fixture.buy.address,
        DEFAULT_NONCE,
    );
    // A 500 bps solver fee against a 100 bps tolerance is rejected.
    intent.solver_fee_bps = 500;

    assert_contract_error(
        fixture
            .router
            .try_execute_intent(&fixture.solver, &intent, &MIN_BUY_AMOUNT),
        SlipGuardError::SlippageExceeded,
    );
}

#[test]
fn test_execute_intent_reverts_on_invalid_amounts() {
    let env = Env::default();
    let fixture = setup(&env);

    let mut intent = sample_intent(
        &fixture.trader,
        &fixture.sell.address,
        &fixture.buy.address,
        DEFAULT_NONCE,
    );
    intent.sell_amount = 0;

    assert_contract_error(
        fixture
            .router
            .try_execute_intent(&fixture.solver, &intent, &MIN_BUY_AMOUNT),
        SlipGuardError::InvalidAmount,
    );
}

#[test]
fn test_execute_intent_reverts_on_invalid_slippage_bps() {
    let env = Env::default();
    let fixture = setup(&env);

    let mut intent = sample_intent(
        &fixture.trader,
        &fixture.sell.address,
        &fixture.buy.address,
        DEFAULT_NONCE,
    );
    intent.max_slippage_bps = 10_001;

    assert_contract_error(
        fixture
            .router
            .try_execute_intent(&fixture.solver, &intent, &MIN_BUY_AMOUNT),
        SlipGuardError::InvalidSlippageBps,
    );
}

#[test]
fn test_execute_intent_reverts_when_solver_is_trader() {
    let env = Env::default();
    let fixture = setup(&env);

    let intent = sample_intent(
        &fixture.trader,
        &fixture.sell.address,
        &fixture.buy.address,
        DEFAULT_NONCE,
    );

    assert_contract_error(
        fixture
            .router
            .try_execute_intent(&fixture.trader, &intent, &MIN_BUY_AMOUNT),
        SlipGuardError::UnauthorizedTrader,
    );
}

#[test]
fn test_execute_intent_reverts_on_double_fill() {
    let env = Env::default();
    let fixture = setup(&env);

    let intent = sample_intent(
        &fixture.trader,
        &fixture.sell.address,
        &fixture.buy.address,
        DEFAULT_NONCE,
    );

    fixture
        .router
        .execute_intent(&fixture.solver, &intent, &MIN_BUY_AMOUNT);

    assert_contract_error(
        fixture
            .router
            .try_execute_intent(&fixture.solver, &intent, &MIN_BUY_AMOUNT),
        SlipGuardError::IntentNotActive,
    );
}

#[test]
fn test_execute_intent_reverts_on_reused_nonce() {
    let env = Env::default();
    let fixture = setup(&env);

    let first = sample_intent(
        &fixture.trader,
        &fixture.sell.address,
        &fixture.buy.address,
        DEFAULT_NONCE,
    );
    fixture
        .router
        .execute_intent(&fixture.solver, &first, &MIN_BUY_AMOUNT);

    // Same trader, same nonce, different terms: a distinct hash, still rejected.
    let mut second = sample_intent(
        &fixture.trader,
        &fixture.sell.address,
        &fixture.buy.address,
        DEFAULT_NONCE,
    );
    second.deadline = DEFAULT_DEADLINE + 1_000;

    assert_contract_error(
        fixture
            .router
            .try_execute_intent(&fixture.solver, &second, &MIN_BUY_AMOUNT),
        SlipGuardError::NonceAlreadyUsed,
    );
}

#[test]
fn test_cancel_intent_blocks_later_fill() {
    let env = Env::default();
    let fixture = setup(&env);

    let intent = sample_intent(
        &fixture.trader,
        &fixture.sell.address,
        &fixture.buy.address,
        DEFAULT_NONCE,
    );
    let intent_hash = fixture.router.get_intent_hash(&intent);

    fixture.router.cancel_intent(&intent);

    assert_eq!(
        fixture.router.get_intent_status(&intent_hash),
        IntentStatus::Cancelled
    );
    assert!(fixture
        .router
        .is_nonce_used(&fixture.trader, &DEFAULT_NONCE));
    assert!(fixture.router.get_fill_receipt(&intent_hash).is_none());

    assert_contract_error(
        fixture
            .router
            .try_execute_intent(&fixture.solver, &intent, &MIN_BUY_AMOUNT),
        SlipGuardError::IntentNotActive,
    );
}

#[test]
fn test_cancel_intent_rejects_double_cancel() {
    let env = Env::default();
    let fixture = setup(&env);

    let intent = sample_intent(
        &fixture.trader,
        &fixture.sell.address,
        &fixture.buy.address,
        DEFAULT_NONCE,
    );

    fixture.router.cancel_intent(&intent);

    assert_contract_error(
        fixture.router.try_cancel_intent(&intent),
        SlipGuardError::IntentNotActive,
    );
}

#[test]
fn test_mock_token_transfer_and_allowance_flow() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let holder = Address::generate(&env);
    let spender = Address::generate(&env);
    let recipient = Address::generate(&env);

    let token = deploy_token(&env, &admin, 7, "Stellar Lumens", "XLM");
    assert_eq!(token.decimals(), 7);
    assert_eq!(token.symbol(), String::from_str(&env, "XLM"));

    token.mint(&holder, &1_000);
    assert_eq!(token.balance(&holder), 1_000);

    token.approve(&holder, &spender, &400, &100);
    assert_eq!(token.allowance(&holder, &spender), 400);

    token.transfer_from(&spender, &holder, &recipient, &250);
    assert_eq!(token.balance(&recipient), 250);
    assert_eq!(token.balance(&holder), 750);
    assert_eq!(token.allowance(&holder, &spender), 150);
}
