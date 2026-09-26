#!/usr/bin/env bash
#
# Create the SlipGuard Wave issue backlog in one run.
#
# Idempotent enough to be re-run: labels are created with --force, so only the
# issues themselves are duplicated if you run it twice. Use DRY_RUN=true first.
#
# Usage:
#   DRY_RUN=true ./scripts/create-wave-issues.sh     # print the plan
#   ./scripts/create-wave-issues.sh                  # create labels + issues
#   REPO=my-org/my-fork ./scripts/create-wave-issues.sh
#
set -euo pipefail

REPO="${REPO:-SlipGuard-HQ/stellar-slipguard}"
DRY_RUN="${DRY_RUN:-false}"

log() { printf '\033[1m==>\033[0m %s\n' "$*"; }
fail() {
  printf '\033[31merror:\033[0m %s\n' "$*" >&2
  exit 1
}

[[ "$DRY_RUN" == "true" ]] || command -v gh >/dev/null 2>&1 || fail "the 'gh' CLI is not on PATH"

label() {
  local name="$1" description="$2" color="$3"
  if [[ "$DRY_RUN" == "true" ]]; then
    printf '  [dry-run] label %s\n' "$name"
    return 0
  fi
  gh label create "$name" \
    --repo "$REPO" \
    --description "$description" \
    --color "$color" \
    --force >/dev/null
}

issue() {
  local title="$1" labels="$2"
  local body
  body="$(cat)"
  if [[ "$DRY_RUN" == "true" ]]; then
    printf '  [dry-run] issue %s\n         labels: %s\n' "$title" "$labels"
    return 0
  fi
  gh issue create --repo "$REPO" --title "$title" --body "$body" --label "$labels"
}

TRIVIAL="difficulty: trivial 100pts"
MEDIUM="difficulty: medium 150pts"
HIGH="difficulty: high 200pts"
WAVE="wave-ready"
CONTRACTS="area: contracts"
SDK="area: sdk"
BOT="area: solver-bot"
CI="area: ci"
DOCS="area: docs"

log "repository: $REPO"
log "dry run:    $DRY_RUN"

# ---------------------------------------------------------------- labels
log "creating labels"
label "$WAVE" "Ready to be claimed in a Wave sprint" "0E8A16"
label "$TRIVIAL" "Small, well-scoped task. 100 points on merge." "C2E0C6"
label "$MEDIUM" "Multi-file task with some design decisions. 150 points on merge." "FBCA04"
label "$HIGH" "Substantial change touching economics, storage or security. 200 points on merge." "D93F0B"
label "$CONTRACTS" "Rust and Soroban contracts" "1D76DB"
label "$SDK" "TypeScript SDK" "5319E7"
label "$BOT" "Solver keeper bot" "0E8A16"
label "$CI" "CI, tooling and release automation" "BFD4F2"
label "$DOCS" "Documentation" "BFDADC"

# ------------------------------------------------------------- contracts
log "creating contract issues"

issue "perf(router): batch-read intent statuses for indexers" "$TRIVIAL,$WAVE,$CONTRACTS" <<'EOF'
## Summary

Reading the status of N intents currently costs N RPC simulations. Add a
read-only entry point that returns the status of several intent hashes in one
call.

## Why it matters

Any indexer or dashboard that tracks live intents is bottlenecked on round
trips, not on compute. One batched read makes the router usable by off-chain
indexers without them hammering Soroban RPC.

## Acceptance Criteria

- [ ] New entry point `get_intent_statuses(hashes: Vec<BytesN<32>>) -> Vec<IntentStatus>`.
- [ ] Returns `Active` for hashes that have never been touched, matching `get_intent_status`.
- [ ] Bounded by a documented maximum input length, returning a typed error above it.
- [ ] Unit tests cover empty input, unknown hashes, and mixed known/unknown.
- [ ] `cargo fmt --all -- --check`, `cargo clippy --all-targets -- -D warnings` and `cargo test --all` pass.
- [ ] README contract table updated.

## Tech Stack

Rust, Soroban SDK 26, `soroban_sdk::Vec`

## Out of Scope

Pagination and storage layout changes.
EOF

issue "test(router): property tests for the basis-point and slippage math" "$MEDIUM,$WAVE,$CONTRACTS" <<'EOF'
## Summary

The fee and slippage math (`mul_bps`, the shortfall calculation in
`execute_intent`) is only covered by example-based tests. Add property tests
that assert the invariants hold for arbitrary inputs.

## Why it matters

This is the code that decides how much a trader receives. A rounding error at a
boundary is a real loss of funds, and example-based tests will not find it.

## Acceptance Criteria

- [ ] Invariants asserted, at minimum:
  - [ ] `mul_bps(amount, 0) == 0` and `mul_bps(amount, 10_000) == amount`.
  - [ ] `mul_bps` never exceeds `amount`.
  - [ ] The trader's net proceeds are never greater than `actual_buy_amount`.
  - [ ] Any fill accepted by `execute_intent` satisfies `actual_buy_amount >= min_buy_amount`.
- [ ] Cases near `i128` bounds assert `MathOverflow` rather than panicking.
- [ ] No `unwrap()` outside test code.
- [ ] `cargo test --all` passes and `cargo clippy --all-targets -- -D warnings` is clean.

## Tech Stack

Rust, Soroban SDK 26, `proptest` (dev-dependency), `soroban_sdk::testutils`

## Out of Scope

Changing the fee or slippage semantics themselves.
EOF

issue "feat(router): add an admin pause switch that halts settlement" "$MEDIUM,$WAVE,$CONTRACTS" <<'EOF'
## Summary

Add a pause flag, settable only by the admin, that makes `execute_intent`
return a typed error. Cancellation must keep working while paused so traders can
always withdraw.

## Why it matters

Without a circuit breaker, a discovered bug in the token transfer path can only
be mitigated by asking everyone to stop using the contract. A pause lets the
protocol stop new fills immediately while leaving the exit path open.

## Acceptance Criteria

- [ ] `pause(admin)` and `unpause(admin)` entry points, both `admin.require_auth()`.
- [ ] New `Paused` error variant, emitted when `execute_intent` is called while paused.
- [ ] `cancel_intent` is **not** gated by the pause.
- [ ] `Paused` state lives in instance storage and is readable via a getter.
- [ ] Events emitted on both transitions.
- [ ] Tests cover pause, unpause, a blocked fill, and a cancellation that still succeeds while paused.
- [ ] README documents the new entry points, errors and events.

## Tech Stack

Rust, Soroban SDK 26

## Out of Scope

Time-bounded pauses, a pause guardian role, and multisig admin.
EOF

issue "feat(router): support partial fills on an intent" "$HIGH,$WAVE,$CONTRACTS" <<'EOF'
## Summary

Allow a solver to fill part of an intent. Add an explicit `remaining_amount`
tracked in storage, a `PartiallyFilled` status, and allow multiple fills until
the sell side is exhausted.

## Why it matters

Large orders cannot be filled in one ledger without moving the pool. Partial
fills are what make SlipGuard usable for size instead of only for small orders.

## Design

### Storage

- `IntentFill { filled_sell: i128, filled_buy: i128, fills: u32 }` under
  `DataKey::IntentFill(BytesN<32>)`, persistent, TTL-extended on every write.
- Status gains a `PartiallyFilled` variant.

### Entry points and auth

- `execute_intent` keeps `solver.require_auth()` and `intent.trader.require_auth()`.
- A partial fill moves `sell_amount * fill_bps / 10_000` of the sell side.
- The nonce is consumed on the **first** fill, not on completion, so a partially
  filled intent cannot be replayed from scratch.

### Invariants

- `filled_sell <= intent.sell_amount` at all times.
- Cumulative trader proceeds must always satisfy `min_buy_amount` pro rata.
- `max_slippage_bps` is evaluated against the cumulative figures, not per fill.

### TTL

The fill record must be extended on every write, or a long-running partial fill
can expire mid-order.

## Risks

Rounding on partial amounts (pro rata math must never favour the solver),
cumulative slippage accounting, and reentrancy while a fill is in progress.

## Acceptance Criteria

- [ ] Pro rata math documented with worked examples in the README.
- [ ] A partial fill cannot overshoot the sell amount.
- [ ] Cumulative slippage enforcement tested.
- [ ] Nonce is consumed exactly once per intent.
- [ ] Tests: two partial fills to completion, overshoot rejection, replay rejection.
- [ ] SDK updated to express partial fills.

## Tech Stack

Rust, Soroban SDK 26, TypeScript SDK

## Out of Scope

On-chain order books or solver auctions.
EOF

# --------------------------------------------------------------------- sdk
log "creating SDK issues"

issue "docs(sdk): add JSDoc examples for every exported symbol" "$TRIVIAL,$WAVE,$SDK" <<'EOF'
## Summary

Every export in `packages/sdk/src/index.ts` should carry a JSDoc block with a
short, runnable example.

## Why it matters

The SDK is the first thing an integrator reads. Types alone do not show the
order of builder calls or which network preset to use.

## Acceptance Criteria

- [ ] Every export documented, including `NETWORKS`, `IntentStatus` and the error types.
- [ ] Each example is valid TypeScript (at least one is compiled in a test).
- [ ] `pnpm --filter @slipguard/sdk build` emits the comments into `dist/*.d.ts`.
- [ ] `pnpm --filter @slipguard/sdk test` and `pnpm exec prettier --check .` pass.

## Tech Stack

TypeScript, TSDoc, Vitest

## Out of Scope

A generated API reference site.
EOF

issue "test(sdk): fuzz intent deserialization against malformed payloads" "$TRIVIAL,$WAVE,$SDK" <<'EOF'
## Summary

`deserializeIntent` is the entry point for untrusted feed data. Add a table of
malformed, adversarial and boundary payloads and assert it throws
`IntentValidationError` rather than a `TypeError` or silently accepting a bad
intent.

## Why it matters

A solver bot that crashes on one malformed feed entry stops filling every other
intent. Failing loudly with a typed error is what lets the watcher skip a bad
entry and continue.

## Acceptance Criteria

- [ ] Cases covered: wrong types, missing fields, negative amounts, zero amounts,
      `maxSlippageBps` above 10,000, fractional basis points, non-integer deadlines.
- [ ] Every rejection throws `IntentValidationError`.
- [ ] Valid payloads round-trip unchanged.
- [ ] `pnpm --filter @slipguard/sdk test` passes.

## Tech Stack

TypeScript, Vitest

## Out of Scope

The contract-side decoding of the intent.
EOF

issue "feat(sdk): decode FillReceipt from a transaction result" "$MEDIUM,$WAVE,$SDK" <<'EOF'
## Summary

Add a helper that takes a settled transaction (or a Soroban RPC result) and
decodes the `FillReceipt` emitted by a successful `execute_intent`, returning a
typed object instead of raw XDR.

## Why it matters

Every integrator currently hand-rolls this decoding, and getting it wrong is
silent. The solver bot needs it for its success logging; a UI needs it to show
"you sold 10 XLM for 9.51 USDC".

## Acceptance Criteria

- [ ] `decodeFillReceipt(...)` returns `FillReceipt` with `buyAmount` as `bigint` and `intentHash` as hex.
- [ ] Throws a typed error when the transaction failed or returned no receipt.
- [ ] Unit tests using a captured XDR fixture for a successful fill and a failed transaction.
- [ ] `pnpm --filter @slipguard/sdk test` and `pnpm --filter @slipguard/sdk typecheck` pass.

## Tech Stack

TypeScript, `@stellar/stellar-sdk` XDR, Vitest

## Out of Scope

Indexing historical fills.
EOF

issue "feat(sdk): sign and attach the trader's authorization entry" "$HIGH,$WAVE,$SDK" <<'EOF'
## Summary

Add a supported path for a trader to sign the authorization entry for their own
intent, and for a solver to attach it to a fill. Today this is left to the
integrator and is the most error-prone part of the whole flow.

## Why it matters

This is the mechanism that makes the protocol non-custodial. If the ergonomics
are wrong, people will hand over keys instead, which defeats the design.

## Design

- Sign the invocation tree for `execute_intent` with the exact intent arguments.
- Return the entry as both an XDR object and a base64 string so it can travel
  through a JSON feed.
- Document the lifetime semantics: the entry is valid until a given ledger and
  must be re-signed after that.

## Acceptance Criteria

- [ ] `signIntentAuthorization(...)` produces an entry the router accepts.
- [ ] The entry is scoped to one intent; changing any field invalidates it.
- [ ] A test asserts a tampered intent (different amount) is rejected.
- [ ] README and `docs/` show the trader-to-solver handoff end to end.
- [ ] SDK typechecks and tests pass.

## Tech Stack

TypeScript, `@stellar/stellar-sdk` (`authorizeEntry`, `Operation`), Vitest, Soroban auth

## Out of Scope

Fee-bump sponsorship and passkey signers.
EOF

# -------------------------------------------------------------- solver bot
log "creating solver bot issues"

issue "fix(solver-bot): back off exponentially on RPC rate limits" "$TRIVIAL,$WAVE,$BOT" <<'EOF'
## Summary

When Soroban RPC returns a rate-limit or transient error, back off
exponentially with jitter instead of retrying on the next tick.

## Why it matters

Public RPC endpoints throttle. A tight retry loop turns a temporary throttle
into a sustained ban, and the bot stops filling orders for the rest of the
cycle.

## Acceptance Criteria

- [ ] Retries for `getEvents`, `simulateTransaction` and `sendTransaction` use exponential backoff with jitter.
- [ ] Backoff resets after a successful call.
- [ ] Backoff state is visible in the structured logs.
- [ ] A unit test asserts the delay sequence grows and stays within bounds.
- [ ] `pnpm --filter @slipguard/solver-bot test` passes.

## Tech Stack

TypeScript, Vitest, Soroban RPC

## Out of Scope

Multi-endpoint failover.
EOF

issue "feat(solver-bot): persist seen intent hashes across restarts" "$MEDIUM,$WAVE,$BOT" <<'EOF'
## Summary

Persist the watcher's dedupe set to disk so a restart does not re-evaluate
intents it has already seen (and potentially double-submit a fill).

## Why it matters

A crash loop currently re-processes everything it can see, which wastes RPC
budget and races against its own in-flight transaction.

## Design

- Append-only log of `{ hash, firstSeenLedger, status }` under a configurable
  path (`STATE_FILE`, default `.slipguard/seen.jsonl`).
- Bounded by age: entries older than the intent deadline horizon are compacted.
- The in-memory set is rebuilt from the file on startup.

## Acceptance Criteria

- [ ] State file path configurable and documented in `.env.example`.
- [ ] Restart does not re-evaluate a previously seen intent (tested).
- [ ] Compaction keeps the file from growing without bound.
- [ ] A corrupt or truncated file is recovered from rather than crashing the daemon.
- [ ] Tests cover round-trip, compaction and corruption recovery.

## Tech Stack

TypeScript, Vitest, Node `node:fs`

## Out of Scope

A shared database across multiple solver instances.
EOF

issue "feat(solver-bot): price intents from Soroswap reserves instead of a static table" "$HIGH,$WAVE,$BOT" <<'EOF'
## Summary

Replace the static `TOKEN_PRICES` table with live pool reserves read from the
Soroswap router, so profitability is computed from the pool the fill will
actually move.

## Why it matters

A static price table is optimistic by construction: it ignores both the price
impact of the fill and the pool's current state. Solvers using it will submit
fills that revert or lose money.

## Design

- Read reserves for the sell/buy pair from the Soroswap router on each poll.
- Apply constant-product math to compute the executable output for `sell_amount`.
- Subtract the trader's fill amount and gas, then compare against `MIN_PROFIT`.
- Fall back to the static table only if reserves are unavailable, and log that
  fallback at `warn`.

## Acceptance Criteria

- [ ] Reserves are read from an on-chain source, not a hardcoded number.
- [ ] Price impact of the fill is included in the expected output.
- [ ] A unit test asserts the constant-product math against known reserves.
- [ ] A unit test asserts an unprofitable fill after impact is skipped.
- [ ] Pool address configurable; fallback path tested.
- [ ] `docs/` explains the profitability model with worked numbers.

## Tech Stack

TypeScript, Soroban RPC, Soroswap router, Vitest

## Out of Scope

Multi-hop routing and other DEXes.
EOF

issue "feat(solver-bot): expose a Prometheus metrics endpoint" "$MEDIUM,$WAVE,$BOT" <<'EOF'
## Summary

Serve `/metrics` with counters for intents observed, evaluated, submitted,
settled, rejected (by reason), plus gas spent and net profit.

## Why it matters

An unmonitored solver cannot be tuned. Today the only way to answer "why did it
stop filling?" is to read JSON logs by hand.

## Acceptance Criteria

- [ ] Endpoint bound to `METRICS_PORT` (default 9464) and disabled when the port is unset.
- [ ] Counters for observed / evaluated / profitable / submitted / settled / failed, labelled by reason.
- [ ] Gauges for last successful poll ledger and current RPC latency.
- [ ] Endpoint returns valid Prometheus text format (asserted in a test).
- [ ] Documented in `.env.example` and the solver guide.

## Tech Stack

TypeScript, `prom-client`, Vitest

## Out of Scope

Dashboards, alerting rules and tracing.
EOF

issue "feat(solver-bot): support multiple concurrent solver keys" "$HIGH,$WAVE,$BOT" <<'EOF'
## Summary

Allow several solver accounts to be configured and rotated, so the bot does not
serialize every fill behind one account's sequence number.

## Why it matters

A single solver account can only have one in-flight transaction at a time. On a
5-second ledger that caps throughput at one fill per ledger no matter how many
opportunities appear.

## Design

- `SOLVER_SECRET_KEYS` accepts a comma-separated list; `SOLVER_SECRET_KEY` stays supported.
- A simple round-robin allocator picks the next free key per fill.
- A key that fails with a sequence or insufficient-balance error is quarantined
  with a backoff rather than retried on every tick.
- Per-key balances are checked before a fill is attempted.

## Acceptance Criteria

- [ ] Multiple keys configured and used round-robin (asserted in a test).
- [ ] A failing key is quarantined and the others keep working.
- [ ] Insufficient balance on a key skips that key and logs once, not per tick.
- [ ] Backwards compatible with a single `SOLVER_SECRET_KEY`.
- [ ] `docs/` explains throughput implications.

## Tech Stack

TypeScript, Soroban RPC, Vitest

## Out of Scope

Remote signers, HSM integration and fee-bump accounts.
EOF

# ----------------------------------------------------------------- ci/doc
log "creating CI and docs issues"

issue "chore(ci): add a coverage job for the Rust contracts" "$TRIVIAL,$WAVE,$CI" <<'EOF'
## Summary

Run `cargo llvm-cov` in CI and publish the coverage summary as a job summary and
(optionally) to Codecov.

## Why it matters

Coverage is the cheapest early signal that a PR touched settlement logic without
adding a test. The contract tests are the only thing standing between a bug and
someone's funds.

## Acceptance Criteria

- [ ] Coverage job added to `.github/workflows/ci.yml`, uploading results.
- [ ] Job summary shows line and branch coverage for `slipguard-router`.
- [ ] Job does not block merges on a coverage threshold yet, but reports a
      regression versus `main`.
- [ ] `pnpm lint` and `pnpm test` remain unchanged and green.

## Tech Stack

GitHub Actions, `cargo-llvm-cov`, Rust

## Out of Scope

Enforcing a minimum coverage threshold.
EOF

issue "feat(ci): publish release WASM artifacts and attach contract ids to the tag" "$MEDIUM,$WAVE,$CI" <<'EOF'
## Summary

Add a tag-triggered workflow that builds the release WASM, uploads it as a
release asset with its SHA-256, and writes the deployed contract ids into the
release body.

## Why it matters

A reviewer or integrator needs the exact bytecode and the contract address for a
release, not a build from an arbitrary commit. This is also what the Wave
submission needs for its release link.

## Acceptance Criteria

- [ ] Workflow triggers on `v*` tags.
- [ ] Builds with `--target wasm32v1-none --release` and uploads both `.wasm` files.
- [ ] Prints and attaches SHA-256 checksums for each artifact.
- [ ] Release body includes a table of contract ids per network, read from a checked-in manifest.
- [ ] Workflow fails if the manifest is missing an entry for a network being released to.

## Tech Stack

GitHub Actions, `softprops/action-gh-release`, Rust, Stellar CLI

## Out of Scope

Automatic deployment to mainnet.
EOF

issue "docs: add a GitBook-ready protocol mechanics page with worked numbers" "$MEDIUM,$WAVE,$DOCS" <<'EOF'
## Summary

Write `docs/02-protocol-mechanics.md`: the full intent lifecycle and the
economics, with real worked numbers rather than placeholders.

## Why it matters

Reviewers and integrators both need to see the intended lifecycle and check the
math themselves. Vague prose here reads as an unfinished project.

## Acceptance Criteria

- [ ] Lifecycle documented as a state machine: Active, PartiallyFilled (once it exists), Filled, Cancelled.
- [ ] A worked example with concrete amounts showing the solver fee, the trader's net proceeds, and the resulting shortfall in basis points.
- [ ] A table of which error is raised at each rejection point.
- [ ] Every number traceable to the code, not invented.
- [ ] No em dashes, no filler adjectives, short direct sentences.
- [ ] README links to the page.

## Tech Stack

Markdown, GitBook

## Out of Scope

A hosted docs deployment.
EOF

issue "docs: write the trader and solver operator guides" "$MEDIUM,$WAVE,$DOCS" <<'EOF'
## Summary

Write `docs/03-end-user-guides.md` covering both personas in plain language.

## Why it matters

The protocol has two sides and both need a cold start. A trader needs to know
what they are signing; a solver needs to know what they earn and what they risk.

## Acceptance Criteria

- [ ] Trader section: what an intent is, how to pick `min_buy_amount` and `max_slippage_bps`, how to cancel, and what happens if nobody fills.
- [ ] Solver section: how profitability is computed, what the solver fee is, what reverts cost, and how to run the bot safely (`DRY_RUN=true` first).
- [ ] Every code sample is copy-pasteable and matches the shipped SDK surface.
- [ ] No unverified statistics; anything numeric must come from the code or a cited source.
- [ ] README links to the guide.

## Tech Stack

Markdown, GitBook

## Out of Scope

Video walkthroughs.
EOF

log "done"
if [[ "$DRY_RUN" != "true" ]]; then
  log "list the backlog with: gh issue list --repo $REPO --label wave-ready"
fi
