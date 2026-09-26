# 2. Protocol mechanics

## The intent lifecycle

An intent is identified by the SHA-256 hash of its own fields. There is no
registration step: the hash is computed when needed, and the only state stored
against it is its lifecycle status.

```
                    cancel_intent (trader auth)
      +-------------------------------------------------+
      |                                                 v
   Active                                          Cancelled  (terminal)
      |
      | execute_intent (solver auth + trader auth)
      |  - all checks pass
      v
    Filled  (terminal)
```

| Status | Value | How it is reached |
| --- | --- | --- |
| `Active` | 0 | The default. Also what an unknown hash reads as. |
| `Filled` | 1 | A successful `execute_intent`. A `FillReceipt` is written. |
| `Cancelled` | 2 | The trader called `cancel_intent` before any fill. |
| `Expired` | 3 | Defined for completeness. Never written to storage. |

`Expired` is never persisted because expiry is a property of the clock, not of
the intent. An unfilled intent past its deadline still reads `Active` from
`get_intent_status`; the deadline is enforced inside `execute_intent`. Reading
`Active` therefore means "not filled and not cancelled", not "still fillable".

Either terminal transition consumes the `(trader, nonce)` pair. A nonce can be
used once per trader, across all intents, forever.

## The settlement sequence

`execute_intent` runs in this order, and the order matters.

1. `solver.require_auth()`.
2. Reject if `solver == intent.trader`.
3. `intent.trader.require_auth()`.
4. Reject if `sell_amount <= 0` or `min_buy_amount <= 0`.
5. Reject if either basis-point field is above 10,000.
6. Reject if `ledger().timestamp() > deadline`.
7. Reject if `actual_buy_amount < min_buy_amount`.
8. Reject if the intent's status is not `Active`.
9. Reject if `(trader, nonce)` has been consumed.
10. Compute the solver fee and the trader's net proceeds; reject if the fee
    breach exceeds `max_slippage_bps`.
11. **Write** the status as `Filled` and consume the nonce.
12. Move the tokens.
13. Write the `FillReceipt` and emit `IntentFilled`.

Steps 11 and 12 are the reason for this ordering. State is committed before any
external call, so a hostile token contract cannot re-enter `execute_intent`,
observe the intent as still `Active`, and settle it a second time.

## Which error comes from where

| Check | Error |
| --- | --- |
| `solver == trader` | `UnauthorizedTrader` (4) |
| `sell_amount <= 0` or `min_buy_amount <= 0` | `InvalidAmount` (9) |
| `max_slippage_bps > 10_000` or `solver_fee_bps > 10_000` | `InvalidSlippageBps` (8) |
| `timestamp > deadline` | `IntentExpired` (1) |
| `actual_buy_amount < min_buy_amount` | `InsufficientOutput` (2) |
| Status is `Filled` or `Cancelled` | `IntentNotActive` (6) |
| Nonce already consumed | `NonceAlreadyUsed` (5) |
| Fee breach exceeds tolerance | `SlippageExceeded` (3) |
| Arithmetic overflow | `MathOverflow` (7) |
| Second `init` | `AlreadyInitialized` (10) |

## The fee and slippage math

The solver's fee is deducted from the fill, and the trader's net proceeds are
what must satisfy the trader's tolerance.

```
solver_fee      = actual_buy_amount * solver_fee_bps / 10_000
trader_proceeds = actual_buy_amount - solver_fee

if trader_proceeds < min_buy_amount:
    shortfall     = min_buy_amount - trader_proceeds
    shortfall_bps = shortfall * 10_000 / min_buy_amount
    reject if shortfall_bps > max_slippage_bps
```

All of it is `i128` integer arithmetic with checked operations. Basis points are
floored, which rounds in the solver's favour by at most one unit and can never
push the trader below what the check allows.

### Worked example: a fill that settles

The trader sells XLM and buys USDC. XLM has 7 decimals, USDC has 6.

| Field | Value | Meaning |
| --- | --- | --- |
| `sell_amount` | `1_000_000_000` | 10.0 XLM |
| `min_buy_amount` | `9_500_000` | 9.5 USDC, the gross floor |
| `max_slippage_bps` | `50` | 0.50% |
| `solver_fee_bps` | `10` | 0.10% |
| `actual_buy_amount` | `9_500_000` | the solver delivers exactly the floor |

```
solver_fee      = 9_500_000 * 10 / 10_000 = 9_500
trader_proceeds = 9_500_000 - 9_500       = 9_490_500
shortfall       = 9_500_000 - 9_490_500   = 9_500
shortfall_bps   = 9_500 * 10_000 / 9_500_000 = 10
```

`10 <= 50`, so the fill settles.

- The trader pays 10.0 XLM and receives **9.4905 USDC**. Effective price:
  0.94905 USDC per XLM.
- The solver pays 9.5 USDC into the router, receives 0.0095 USDC back as its
  fee, and receives 10.0 XLM. Net USDC cost: **9.4905 USDC** for 10.0 XLM.
- The solver breaks even by selling 10.0 XLM for more than 9.4905 USDC. Anything
  above that is profit, before transaction cost.

Note what the fee does here. The trader asked for 9.5 USDC and gets 9.4905. That
0.5% gap is exactly the solver's fee, and the mandatory minimum still holds
because 10 basis points of shortfall is inside the trader's 50 basis point
tolerance. If the trader had set `max_slippage_bps` to `5`, this fill would be
rejected: the fee alone would breach their tolerance.

### Worked example: a fill that reverts

Same intent, but the solver attempts a 5% fee against a 1% tolerance.

| Field | Value |
| --- | --- |
| `min_buy_amount` | `9_500_000` |
| `max_slippage_bps` | `100` |
| `solver_fee_bps` | `500` |
| `actual_buy_amount` | `9_500_000` |

```
solver_fee      = 9_500_000 * 500 / 10_000 = 475_000
trader_proceeds = 9_500_000 - 475_000       = 9_025_000
shortfall       = 475_000
shortfall_bps   = 475_000 * 10_000 / 9_500_000 = 500
```

`500 > 100`. The call returns `SlippageExceeded` and no token moves.

### Worked example: over-delivery

A solver that delivers more than the minimum never trips the tolerance check.
With `actual_buy_amount = 9_600_000` and a 10 basis point fee:

```
solver_fee      = 9_600
trader_proceeds = 9_590_400
```

`9_590_400 > 9_500_000`, so the shortfall branch is skipped entirely. Slippage
only binds downward, which is correct for a sell order: getting more is not a
violation.

## Expiry

```
reject if ledger().timestamp() > deadline
```

The comparison is strict. A fill in the same second as the deadline succeeds.
Timestamps come from the ledger, not from the submitting client, so a solver
cannot argue about the clock.

## Hashing

`get_intent_hash` serialises the intent to its canonical `ScVal` XDR form and
takes SHA-256. A `#[contracttype]` struct becomes an `ScMap` with symbol keys
sorted byte-wise, so the encoding is deterministic and independent of field
declaration order.

The JavaScript SDK reproduces this encoding exactly. A golden vector shared
between `contracts/router/src/test.rs` and
`packages/sdk/src/tests/intent.test.ts` asserts that both sides produce the same
hash for the same intent, so a change to either encoder fails the build.

Next: [End-user guides](./03-end-user-guides.md).
