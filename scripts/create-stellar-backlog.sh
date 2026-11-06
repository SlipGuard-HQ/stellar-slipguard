#!/usr/bin/env bash
#
# Create the SlipGuard issue backlog in one run.
#
# Every issue is scoped to a Stellar or Soroban surface: SEP-41 / the Stellar
# Asset Contract, Soroban authorization, storage TTL, Stellar RPC, or the
# `stellar` CLI. There is no points or sprint accounting here; the labels
# describe the area and the type of work, using GitHub's standard labels.
#
# Idempotent enough to be re-run: labels are created with --force, so only the
# issues themselves are duplicated if you run it twice. Use DRY_RUN=true first.
#
# Usage:
#   DRY_RUN=true ./scripts/create-stellar-backlog.sh   # print the plan
#   ./scripts/create-stellar-backlog.sh                # create labels + issues
#   REPO=my-org/my-fork ./scripts/create-stellar-backlog.sh
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

ENHANCEMENT="enhancement"
BUG="bug"
DOCUMENTATION="documentation"
TESTING="testing"
GFI="good first issue"
CONTRACTS="area: contracts"
SDK="area: sdk"
BOT="area: solver-bot"
CI="area: ci"
DOCS="area: docs"
RPC="area: stellar-rpc"
AUTH="area: soroban-auth"

log "repository: $REPO"
log "dry run:    $DRY_RUN"

# ---------------------------------------------------------------- labels
log "creating labels"
label "$TESTING" "Tests and test infrastructure" "C2E0C6"
label "$CONTRACTS" "Soroban contracts under contracts/" "1D76DB"
label "$SDK" "TypeScript SDK against Stellar RPC" "5319E7"
label "$BOT" "Reference solver daemon on Stellar RPC" "0E8A16"
label "$RPC" "Stellar RPC reads, simulations or events" "006B75"
label "$AUTH" "Soroban authorization and auth-entry scoping" "B60205"
label "$CI" "CI, tooling and release automation" "BFD4F2"
label "$DOCS" "Documentation" "BFDADC"

# ------------------------------------------------------------- contracts
log "creating contract issues"

issue "perf(router): batch-read intent statuses for Stellar RPC indexers" "$ENHANCEMENT,$GFI,$CONTRACTS,$RPC" <<'EOF'
## Summary

Reading the status of N intents currently costs N `simulateTransaction` round
trips against Stellar RPC. Add a read-only entry point that returns the status
of several intent hashes in one simulation.

## Stellar surface

`simulateTransaction` on Stellar RPC; Soroban `Vec` argument and return types.

## Acceptance Criteria

- [ ] New entry point `get_intent_statuses(hashes: Vec<BytesN<32>>) -> Vec<IntentStatus>`.
- [ ] Returns `Active` for hashes that have never been touched, matching `get_intent_status`.
- [ ] Bounded by a documented maximum input length, returning a typed error above it.
- [ ] Unit tests cover empty input, unknown hashes, and mixed known/unknown.
- [ ] `cargo fmt --all -- --check`, `cargo clippy --all-targets -- -D warnings` and `cargo test --all` pass.
- [ ] README contract table updated.

## Tech Stack

Rust, Soroban SDK 26, `soroban_sdk::Vec`, Stellar RPC simulation

## Out of Scope

Pagination and storage layout changes.
EOF

issue "test(router): property tests for the basis-point and slippage math" "$TESTING,$CONTRACTS" <<'EOF'
## Summary

The fee and slippage math (`mul_bps`, the shortfall calculation in
`execute_intent`) is only covered by example-based tests. Add property tests
that assert the invariants hold for arbitrary inputs on the Soroban host.

## Stellar surface

`soroban_sdk::testutils` host environment, `i128` contract arithmetic, checked
operations surfaced as `SlipGuardError::MathOverflow`.

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

issue "feat(router): add an admin pause switch that halts settlement" "$ENHANCEMENT,$CONTRACTS,$AUTH" <<'EOF'
## Summary

Add a pause flag, settable only by the admin, that makes `execute_intent`
return a typed error. Cancellation must keep working while paused so traders can
always withdraw.

## Stellar surface

`admin.require_auth()` on both transitions, instance storage with TTL extension,
a new `#[contracterror]` variant and a new `#[contractevent]`.

## Acceptance Criteria

- [ ] `pause(admin)` and `unpause(admin)` entry points, both `admin.require_auth()`.
- [ ] New `Paused` error variant, returned when `execute_intent` is called while paused.
- [ ] `cancel_intent` is **not** gated by the pause.
- [ ] Paused state lives in instance storage and is readable via a getter.
- [ ] Events emitted on both transitions; both are visible through Stellar RPC `getEvents`.
- [ ] Tests cover pause, unpause, a blocked fill, and a cancellation that still succeeds while paused.
- [ ] `docs/05-architecture.md` and the README document the new entry points, errors and events.

## Tech Stack

Rust, Soroban SDK 26

## Out of Scope

Time-bounded pauses, a pause guardian role, and multisig admin.
EOF

issue "feat(router): support partial fills on an intent" "$ENHANCEMENT,$CONTRACTS,$AUTH" <<'EOF'
## Summary

Allow a solver to fill part of an intent. Add an explicit `remaining_amount`
tracked in storage, a `PartiallyFilled` status, and allow multiple fills until
the sell side is exhausted.

## Stellar surface

Persistent storage with TTL extension on every write, Soroban auth scoped to
`execute_intent`, `#[contracttype]` status enum change.

## Stellar surface details

### Storage

- `IntentFill { filled_sell: i128, filled_buy: i128, fills: u32 }` under
  `DataKey::IntentFill(BytesN<32>)`, persistent, TTL-extended on every write.
- Status gains a `PartiallyFilled` variant, which is a breaking `ScVal` enum change.

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
can be archived mid-order.

## Risks

Rounding on partial amounts (pro rata math must never favour the solver),
cumulative slippage accounting, archival expiry of the fill record, and
reentrancy while a fill is in progress.

## Acceptance Criteria

- [ ] Pro rata math documented with worked examples in `docs/02-protocol-mechanics.md`.
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

issue "docs(sdk): add JSDoc examples for every exported symbol" "$DOCUMENTATION,$GFI,$SDK,$DOCS" <<'EOF'
## Summary

Every export in `packages/sdk/src/index.ts` should carry a JSDoc block with a
short, runnable example.

## Stellar surface

Examples must show Stellar contract ids (`C...`), the testnet network passphrase,
and `bigint` amounts as `i128` values.

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

issue "test(sdk): fuzz intent deserialization against malformed payloads" "$TESTING,$GFI,$SDK" <<'EOF'
## Summary

`deserializeIntent` is the entry point for untrusted feed data. Add a table of
malformed, adversarial and boundary payloads and assert it throws
`IntentValidationError` rather than a `TypeError` or silently accepting a bad
intent.

## Stellar surface

Address validation goes through `@stellar/stellar-sdk` `Address`, so malformed
strkeys must be rejected before they reach a Stellar RPC simulation.

## Acceptance Criteria

- [ ] Cases covered: wrong types, missing fields, negative amounts, zero amounts,
      `maxSlippageBps` above 10,000, fractional basis points, non-integer deadlines,
      invalid `G...` / `C...` strkeys.
- [ ] Every rejection throws `IntentValidationError`.
- [ ] Valid payloads round-trip unchanged.
- [ ] `pnpm --filter @slipguard/sdk test` passes.

## Tech Stack

TypeScript, `@stellar/stellar-sdk` `Address`, Vitest

## Out of Scope

The contract-side decoding of the intent.
EOF

issue "feat(sdk): decode FillReceipt from a getTransaction result" "$ENHANCEMENT,$SDK,$RPC" <<'EOF'
## Summary

Add a helper that takes a settled transaction (or a Stellar RPC
`getTransaction` response) and decodes the `FillReceipt` returned by a successful
`execute_intent`, returning a typed object instead of raw XDR.

## Stellar surface

Stellar RPC `getTransaction` response XDR, Soroban `ScVal` `scvMap` decoding,
32-byte `BytesN` intent hashes.

## Acceptance Criteria

- [ ] `decodeFillReceipt(...)` returns `FillReceipt` with `buyAmount` as `bigint` and `intentHash` as hex.
- [ ] Throws a typed error when the transaction failed or returned no receipt.
- [ ] Unit tests using a captured XDR fixture for a successful fill and a failed transaction.
- [ ] `pnpm --filter @slipguard/sdk test` and `pnpm --filter @slipguard/sdk lint` pass.

## Tech Stack

TypeScript, `@stellar/stellar-sdk` XDR, Stellar RPC, Vitest

## Out of Scope

Indexing historical fills.
EOF

issue "feat(sdk): sign and attach the trader's Soroban authorization entry" "$ENHANCEMENT,$SDK,$AUTH" <<'EOF'
## Summary

Add a supported path for a trader to sign the Soroban authorization entry for
their own intent, and for a solver to attach it to a fill. Today this is left to
the integrator and is the most error-prone part of the whole flow.

## Stellar surface

`xdr.SorobanAuthorizationEntry`, invocation-tree signing with
`authorizeEntry`/`Operation`, base64 XDR transport, ledger-bounded signature
expiry, and `assembleTransaction` auth override.

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
- [ ] README and `docs/03-end-user-guides.md` show the trader-to-solver handoff end to end.
- [ ] SDK typechecks and tests pass.

## Tech Stack

TypeScript, `@stellar/stellar-sdk` (`authorizeEntry`, `Operation`), Vitest, Soroban auth

## Out of Scope

Fee-bump sponsorship and passkey signers.
EOF

# -------------------------------------------------------------- solver bot
log "creating solver bot issues"

issue "fix(solver-bot): back off exponentially on Stellar RPC rate limits" "$BUG,$GFI,$BOT,$RPC" <<'EOF'
## Summary

When Stellar RPC returns a rate-limit or transient error, back off exponentially
with jitter instead of retrying on the next tick.

## Stellar surface

`getEvents`, `simulateTransaction` and `sendTransaction` on Stellar RPC.

## Acceptance Criteria

- [ ] Retries use exponential backoff with jitter.
- [ ] Backoff resets after a successful call.
- [ ] Backoff state is visible in the structured logs.
- [ ] A unit test asserts the delay sequence grows and stays within bounds.
- [ ] `pnpm --filter @slipguard/solver-bot test` passes.

## Tech Stack

TypeScript, Vitest, Stellar RPC

## Out of Scope

Multi-endpoint failover.
EOF

issue "feat(solver-bot): persist seen intent hashes across restarts" "$ENHANCEMENT,$BOT" <<'EOF'
## Summary

Persist the watcher's dedupe set to disk so a restart does not re-evaluate
intents it has already seen (and potentially double-submit a fill).

## Stellar surface

Keys are the SHA-256 intent hashes the router computes; entries carry the ledger
sequence in which they were first observed.

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

issue "feat(solver-bot): price intents from Soroswap reserves instead of a static table" "$ENHANCEMENT,$BOT,$RPC" <<'EOF'
## Summary

Replace the static `TOKEN_PRICES` table with live pool reserves read from the
Soroswap router on Soroban, so profitability is computed from the pool the fill
will actually move.

## Stellar surface

Contract invocations through the SDK's `simulateRead`, Soroban `i128` reserves,
constant-product math on Stellar asset pairs.

## Design

- Read reserves for the sell/buy pair from the Soroswap router on each poll.
- Apply constant-product math to compute the executable output for `sell_amount`.
- Subtract the trader's fill amount and `TX_COST`, then compare against `MIN_PROFIT`.
- Fall back to the static table only if reserves are unavailable, and log that
  fallback at `warn`.

## Acceptance Criteria

- [ ] Reserves are read from an on-chain source, not a hardcoded number.
- [ ] Price impact of the fill is included in the expected output.
- [ ] A unit test asserts the constant-product math against known reserves.
- [ ] A unit test asserts an unprofitable fill after impact is skipped.
- [ ] Pool contract id configurable; fallback path tested.
- [ ] `docs/03-end-user-guides.md` explains the profitability model with worked numbers.

## Tech Stack

TypeScript, Stellar RPC, Soroswap router, Vitest

## Out of Scope

Multi-hop routing and other Stellar DEXes.
EOF

issue "feat(solver-bot): support multiple concurrent solver keys" "$ENHANCEMENT,$BOT,$AUTH" <<'EOF'
## Summary

Allow several solver accounts to be configured and rotated, so the bot does not
serialize every fill behind one account's sequence number.

## Stellar surface

Stellar account sequence numbers, `Keypair.fromSecret` per solver, per-account
auth entries.

## Design

- `SOLVER_SECRET_KEYS` accepts a comma-separated list; `SOLVER_SECRET_KEY` stays supported.
- A simple round-robin allocator picks the next free key per fill.
- A key that fails with a sequence or insufficient-balance error is quarantined
  with a backoff rather than retried on every tick.
- Per-key balances are checked with a Soroban `balance` simulation before a fill is attempted.

## Acceptance Criteria

- [ ] Multiple keys configured and used round-robin (asserted in a test).
- [ ] A failing key is quarantined and the others keep working.
- [ ] Insufficient balance on a key skips that key and logs once, not per tick.
- [ ] Backwards compatible with a single `SOLVER_SECRET_KEY`.
- [ ] `docs/04-developer-guide.md` explains throughput implications.

## Tech Stack

TypeScript, Stellar RPC, Vitest

## Out of Scope

Remote signers, HSM integration and fee-bump accounts.
EOF

# ----------------------------------------------------------------- ci/doc
log "creating CI and documentation issues"

issue "chore(ci): add a coverage job for the Soroban contracts" "$TESTING,$GFI,$CI" <<'EOF'
## Summary

Run `cargo llvm-cov` in CI and publish the coverage summary as a job summary.

## Stellar surface

None on chain; the job builds the `wasm32v1-none` target and runs against
`soroban-sdk` testutils.

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

issue "feat(ci): publish release WASM artifacts and attach contract ids to the tag" "$ENHANCEMENT,$CI" <<'EOF'
## Summary

Add a tag-triggered workflow that builds the release WASM, uploads it as a
release asset with its SHA-256, and writes the deployed Stellar contract ids
into the release body.

## Stellar surface

Release `wasm32v1-none` bytecode, Stellar contract ids from
`deployments/<network>.json`, and the `stellar` CLI checksum convention.

## Acceptance Criteria

- [ ] Workflow triggers on `v*` tags.
- [ ] Builds with `--target wasm32v1-none --release` and uploads both `.wasm` files.
- [ ] Prints and attaches SHA-256 checksums for each artifact.
- [ ] Release body includes a table of Stellar contract ids per network, read from a checked-in manifest.
- [ ] Workflow fails if the manifest is missing an entry for a network being released to.

## Tech Stack

GitHub Actions, `softprops/action-gh-release`, Rust, Stellar CLI

## Out of Scope

Automatic deployment to mainnet.
EOF

issue "docs: write a Soroban authorization debugging guide" "$DOCUMENTATION,$DOCS,$AUTH" <<'EOF'
## Summary

Add a page that explains how to debug the most common Soroban authorization
failures seen by integrators, with the exact error each one produces.

## Stellar surface

`SorobanAuthorizationEntry` scoping, invocation trees, ledger-bounded signature
expiry, `simulateTransaction` auth output, and Stellar RPC error responses.

## Acceptance Criteria

- [ ] Each failure mode documented with the error text a developer sees:
      wrong network passphrase, stale auth entry, auth entry signed for a
      different argument set, missing trader authorization, unfunded source account.
- [ ] Each section shows the shortest command that reproduces it on testnet.
- [ ] No screenshots; commands and XDR snippets only.
- [ ] Linked from `docs/04-developer-guide.md` and the README.

## Tech Stack

Markdown, VitePress, Stellar CLI, Stellar RPC

## Out of Scope

A hosted debugging tool.
EOF

log "done"
if [[ "$DRY_RUN" != "true" ]]; then
  log "list the backlog with: gh issue list --repo $REPO --label area: contracts"
fi
