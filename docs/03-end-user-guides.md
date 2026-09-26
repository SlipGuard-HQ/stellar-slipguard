# 3. End-user guides

SlipGuard has two sides. A trader writes an order and waits. A solver finds
orders and fills the profitable ones. Both sides need to exist, and they need
different things.

## For traders

### What you are actually signing

An intent is a set of terms, not a transfer. Signing it does not move anything.
Your tokens stay in your account until a solver fills the order, and that fill
can only happen with your authorization attached to it.

The tradeoff is that your authorization is specific. If you sign an intent that
trades 10 XLM, a solver cannot use your signature to trade 100 XLM instead. If
you change any field, the signature no longer applies.

### Choosing `min_buy_amount`

This is the gross amount of the buy token the solver must deliver. Set it to the
worst price you would genuinely accept, then let the tolerance handle the rest.

Reflexively setting it to a lowball number to "get filled" is how you get filled
at the lowball number every time. The floor is enforced, so it is the floor you
will actually receive.

### Choosing `max_slippage_bps`

This is not your price tolerance on the market. It is the tolerance for how far
your **net proceeds, after the solver's fee**, may fall below `min_buy_amount`.

A concrete consequence: the solver's fee is bounded by this number. If you set
`max_slippage_bps` to `5` (0.05%) and offer a `solver_fee_bps` of `10` (0.10%),
your own fee offer breaches your own tolerance and the fill is rejected. Set the
tolerance at least as high as the fee plus whatever room you want for a
worse-than-ideal fill.

| `max_slippage_bps` | What it means |
| --- | --- |
| `0` | Only exact or better delivery. Any fee at all breaches it. |
| `10` | 0.10% of slack, enough for a typical fee. |
| `50` | 0.50%, room for a fee and a little slippage. |
| `100` | 1.00%, generous. |
| `10000` | 100%, no meaningful protection. |

### Choosing `solver_fee_bps`

This is what you pay for execution. Too low and no solver bothers, because the
fee has to clear their transaction cost and their risk. Too high and you have
given away more than the execution was worth.

The fee is a percentage of the fill, paid in the buy token, so it scales with
the size of the order rather than being a fixed cost.

### The deadline

The deadline is a unix timestamp in seconds. After it, the intent cannot settle.
The comparison is strict, so a fill in the same second as the deadline still
succeeds.

Pick a deadline you are willing to stand behind. A long deadline is an option
that a solver can exercise whenever the market moves in their favour and your
terms look stale.

### Cancelling

Call `cancel_intent` with your authorization. The intent is marked `Cancelled`,
your nonce is consumed, and the same intent can never fill afterwards. You can
cancel at any time before a fill, and cancellation is not gated by anything on
the protocol side.

Cancelling does not refund anything, because nothing was ever moved.

### If nobody fills

The intent expires and nothing happens. No funds moved, and your nonce for that
intent is still unused, so the same nonce can be reused on a new intent. There
is no penalty and no on-chain cleanup required.

### Handing the order to a solver

You have two options.

1. **Sign at fill time.** The solver assembles the fill and asks you to sign.
   You are online and involved in every fill. Simple, but it needs you present.
2. **Sign an authorization entry up front.** You sign an entry scoped to that
   exact intent, with a validity window measured in ledgers, and hand it to
   whoever wants to fill. You do not need to be online when the fill happens,
   and the solver cannot alter the terms.

Both are non-custodial. Never give anyone your secret key. If a solver asks for
it, that is not SlipGuard and you should walk away.

## For solvers

### What you earn

You deliver `actual_buy_amount` of the buy token and receive `sell_amount` of
the sell token, plus `solver_fee_bps` of the fill back in the buy token.

```
your fee        = actual_buy_amount * solver_fee_bps / 10_000
your payout     = the trader's sell_amount, in the sell token
your net cost   = actual_buy_amount - your fee, in the buy token
```

Your profit is the difference between what the sell tokens are worth to you and
your net cost, minus transaction cost.

### Worked example

The trader sells 10.0 XLM and requires at least 9.5 USDC, with a 10 basis point
fee.

```
your fee      = 9_500_000 * 10 / 10_000 = 9_500
your net cost = 9_500_000 - 9_500       = 9_490_500 USDC
you receive   = 10.0 XLM
```

You break even by selling 10.0 XLM for more than 9.4905 USDC. Everything above
that is profit, before the transaction fee. Note that 9_490_500 USDC for 10.0 XLM
is a price of 0.94905 USDC per XLM, which is 0.50% below the trader's floor.

### When a fill makes sense

The check the reference bot performs, in order:

1. Would the router accept this fill? Reject early if the deadline has passed,
   if the fill is below the trader's minimum, or if the fee would breach the
   trader's tolerance. `checkFillAgainstIntent` mirrors the contract exactly.
2. What is the sell token actually worth to you right now? Not the price on a
   chart, the price you can realise after selling it.
3. Subtract your net cost and your transaction cost. If the remainder is above
   your configured minimum, submit.

The reference bot's `GAS_COST` and `MIN_PROFIT` are both denominated in buy
token units, so the comparison is a single integer subtraction.

### What a revert costs you

A rejected `execute_intent` does not move tokens, but you still pay for the
failed transaction. Worse, you spent the ledger slot and received nothing.

This is why step 1 exists. `checkFillAgainstIntent` and the contract's guard
rails are intentionally the same rules, in the same order, so the bot does not
submit a fill that is guaranteed to fail.

The one thing the bot cannot check cheaply is whether someone else filled the
intent first. Two solvers racing on the same intent means the loser pays for a
revert. The intent status check in step 1 comes from your last poll, so a race
is possible between the poll and the submit.

### Running the bot safely

Start in dry-run. It evaluates and logs everything and submits nothing.

```bash
cp .env.example .env
# set ROUTER_CONTRACT_ID and SOLVER_SECRET_KEY

DRY_RUN=true pnpm --filter @slipguard/solver-bot start
```

Read the `evaluated intent` log lines. Each has `profitable`, `reason`,
`netProfit` and `fillAmount`. If the bot says `missing price for sell or buy
token`, your `TOKEN_PRICES` table is incomplete for the pair.

When the decisions look sane, create a fresh solver account with only what you
are willing to risk, fund it with the buy token, and switch `DRY_RUN=false`.

### Configuration that matters most

| Variable | Why it matters |
| --- | --- |
| `MIN_PROFIT` | Your floor, in buy token units. The single knob that decides how aggressive you are. |
| `GAS_COST` | Your estimate of transaction cost, in buy token units. Set it honestly; it is the difference between a profitable bot and a busy one. |
| `TOKEN_PRICES` | How the bot values the sell token. A stale or wrong table produces confidently wrong decisions. |
| `MAX_FEE_STROOPS` | The ceiling on what you will pay per transaction. |
| `POLL_INTERVAL_MS` | Faster polling means less stale data and more RPC load. |

### Logging and shutdown

The bot writes one JSON object per line to stdout, so it pipes into any log
collector without configuration. It handles `SIGINT` and `SIGTERM` by finishing
the current cycle, logging `solver stopped`, and exiting cleanly.

Next: [Developer guide](./04-developer-guide.md).
