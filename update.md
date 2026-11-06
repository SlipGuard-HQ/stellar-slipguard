# Update: SlipGuard is now unambiguously a Stellar and Soroban project

This file records what changed in this update, why it changed, and what evidence
you can point at if you need to explain the project to a reviewer, a grant
program or the Drips Wave team.

It is a change record, not a roadmap. Nothing below is a new product feature;
it is the same protocol, with the Stellar and Soroban dependency made explicit
and with the language that was obscuring it removed.

---

## 1. Why this update exists

SlipGuard was already implemented as Soroban contracts: `soroban-sdk` 26,
`#![no_std]`, `wasm32v1-none`, `Address::require_auth()`, SEP-41 transfers,
ledger timestamps and TTL-extended persistent storage. The code was never the
problem.

The repository did not read that way. Its most distinctive artifacts were:

- a script whose only purpose was to generate an issue backlog labelled with
  points (`difficulty: trivial 100pts`, `wave-ready`), plus three issue
  templates named `Wave: High (200 pts)`;
- EVM vocabulary in a Stellar project: `GAS_COST`, "gas", "ERC-20 style
  allowance", a `Keccak`-style hashing comment (the contract uses SHA-256), and
  "MEV-resistant" in the package description;
- no page anywhere that mapped a Stellar or Soroban primitive to the code that
  depends on it, so the dependency had to be inferred from Rust source.

A reviewer skimming the repository would see a points generator and EVM
terminology, with Soroban somewhere underneath. That is the impression this
update removes. I cannot tell you why a specific reviewer flagged the project;
what I can do is make the Stellar dependency impossible to miss and remove the
signals that were competing with it.

## 2. What changed, by area

| Area | Before | After |
| --- | --- | --- |
| README | Stellar framing in the tagline, then generic order-flow prose and a "Wave issue backlog" section | Opens with the Soroban implementation, then a twelve-row table of Stellar/Soroban primitives with the file that depends on each and the consequence of removing it |
| Documentation | Five pages, no Stellar-specific reference | Same five pages plus `docs/06-stellar-integration.md`, a primitive-by-primitive dependency map (contract, client and operations layers) and an explicit "what is deliberately absent" list |
| Issue templates | Three "Wave: N pts" templates with no Stellar scope requirement | `soroban_contract_issue.md`, `stellar_integration_issue.md`, `starter_issue.md`, each with a required **Stellar surface** section listing `require_auth`, TTL, `ScVal` hashing, SEP-41/SAC, `env.ledger()`, RPC and CLI |
| Backlog script | `scripts/create-wave-issues.sh`, `wave-ready` and `difficulty: * 100pts` labels, 15 issues, several with EVM phrasing | `scripts/create-stellar-backlog.sh`: no points, no `wave-ready`, the `area:` labels plus GitHub's `enhancement`, `bug`, `documentation`, `good first issue` and a `testing` label; 15 issues that each name the Stellar interface they touch |
| Contributing guide | "This repository is part of the Stellar Wave program", points and sprint rules | Stellar/Soroban surface rules: what you must update when you touch auth, storage/TTL, `contracttype` encoding, SEP-41 calls, RPC or the `stellar` CLI, plus a list of terms to avoid |
| PR template | Generic checklist | Adds a **Stellar Surface** section and a "no EVM terminology" check |
| Security policy | Generic contract scope | Adds auth-entry replay, ledger-clock trust, archival/TTL weakening, SAC vs `MockToken` confusion and network-passphrase mistakes to the in-scope list |
| Deployment | Deployed two `MockToken` instances, then the router | Deploys the real **Stellar Asset Contracts** for the pair via `stellar contract asset deploy` when `SELL_ASSET` / `BUY_ASSET` are set; `MockToken` is only the explicit test fallback |
| Solver configuration | `GAS_COST`, "gas cost" | `TX_COST`: the 100-stroop base fee plus the Soroban resource fee, in buy-token units |
| Deployment docs | `deployments/README.md` explained the two mock tokens | States that the record is network-scoped, that the demo tokens are SEP-41 test instances, and shows the SAC deploy command |
| Contract comments | "no ERC-20 style allowance", "`Keccak`-style determinism" | "no SEP-41 allowance to manage", and an accurate description of `ScVal` XDR hashed with `env.crypto().sha256()` |
| Package metadata | "MEV-resistant", "reference solver keeper" | "settled by Soroban contracts on Stellar", "watches Stellar RPC events" |

## 3. The evidence to cite

This is the part that matters for an appeal. Each row is a Stellar or Soroban
primitive that SlipGuard cannot function without, and the file that proves it.

| Primitive | File | What fails without it |
| --- | --- | --- |
| `soroban-sdk` 26, `#![no_std]`, `wasm32v1-none` | `contracts/router/Cargo.toml`, `Cargo.toml`, `rust-toolchain.toml` | The contracts cannot be built at all |
| `#[contract]`, `#[contractimpl]`, `#[contractevent]` | `contracts/router/src/lib.rs` | No entry points, no events |
| Dual `Address::require_auth()` on a fill | `execute_intent` in `contracts/router/src/lib.rs` | The non-custodial guarantee, which is the protocol's reason to exist |
| Soroban authorization entries (`xdr.SorobanAuthorizationEntry`, base64, ledger-bounded) | `packages/sdk/src/client.ts`, `packages/solver-bot/src/executor.ts` | A trader could not hand an intent to a solver while offline |
| `env.ledger().timestamp()` | `execute_intent` deadline check | Deadlines would be a client-side promise |
| Instance/persistent storage plus `extend_ttl` (30-day threshold, 90-day extension, 17,280 ledgers/day) | `contracts/router/src/storage.rs` | Intent status, receipts and the replay guard could be archived |
| `env.crypto().sha256()` over `ScVal` XDR | `get_intent_hash`, mirrored by `hashIntent` | No stable order identity, no shared hash vector with the SDK |
| SEP-41 `TokenClient` (works with the Stellar Asset Contract) | All four settlement transfers | Every asset would need bespoke code |
| `MuxedAddress` (CAP-27) | `execute_intent`, `MockToken::transfer` | Muxed destinations could not be paid |
| Stellar RPC: `simulateTransaction`, `assembleTransaction`, `sendTransaction`, `getTransaction`, `getEvents`, `getLatestLedger` | `packages/sdk/src/client.ts`, `packages/solver-bot/src/watcher.ts` | Nothing could be read, priced or submitted |
| `stellar` CLI: `contract deploy`, `contract asset deploy`, `contract invoke`, `keys` | `scripts/deploy.sh` | No deployment, no SAC resolution, no verification path |
| Network passphrases and strkeys | `NETWORKS`, `loadConfig`, `deployments/testnet.json` | Transactions would be rejected, or addressed to the wrong chain |

The full version of this table, including the client and operations layers and
the list of things deliberately not built, is
[`docs/06-stellar-integration.md`](./docs/06-stellar-integration.md).

There is no Solidity, no EVM bytecode, no `msg.sender`, no chain-abstraction
layer and no off-chain settlement path in this repository. A fill only happens
as a Soroban contract invocation.

## 4. Terminology removed

| Removed | Replaced with | Where |
| --- | --- | --- |
| `GAS_COST` (env var) | `TX_COST` | `.env.example`, `packages/solver-bot/src/config.ts`, docs |
| `gasCost` (field) | `txCost` | `packages/solver-bot/src/evaluator.ts`, `index.ts`, tests |
| "gas cost" in diagrams and prose | "base fee + Soroban resource fee" | README, docs |
| "ERC-20 style allowance" | "SEP-41 allowance" | `contracts/router/src/lib.rs`, README |
| "`Keccak`-style determinism" | `ScVal` XDR hashed with `env.crypto().sha256()` | `contracts/router/src/types.rs` |
| "keeper" | "solver" | README, docs, package descriptions |
| "MEV-resistant" | "slippage-protected ... settled by Soroban contracts" | `package.json` |
| Wave points labels and sprint rules | Stellar surface labels and review rules | issue templates, `CONTRIBUTING.md`, backlog script |

`allowance` still appears where it is the name of the SEP-41 function
(`MockToken::allowance`, `approve`, `transfer_from`), because that is the
interface the contract implements. It no longer appears as a description of the
protocol's design.

## 5. Changes an operator must know about

These are the only changes with runtime consequences.

1. **`GAS_COST` is now `TX_COST`.** Existing `.env` files that set `GAS_COST`
   will silently fall back to `0`, which makes the bot more willing to submit
   marginal fills. Rename the variable. Semantics are unchanged: an estimate of
   the fill's total transaction cost in buy-token units, now explicitly the
   Stellar base fee plus the Soroban resource fee.
2. **`scripts/deploy.sh` has a Stellar Asset Contract mode.** Setting
   `SELL_ASSET` and/or `BUY_ASSET` (`native` for XLM, or `CODE:ISSUER`) resolves
   each side with `stellar contract asset deploy` and skips the mock tokens.
   Setting only one of the two is an error by design. With neither set, the
   script behaves as before and deploys `MockToken` instances, now labelled
   test-only in the output.
3. **`scripts/create-wave-issues.sh` is now
   `scripts/create-stellar-backlog.sh`.** Labels no longer carry points or
   sprint state: `wave-ready` and the three `difficulty: * 100pts` labels are
   gone, replaced by GitHub's standard `enhancement`, `bug`, `documentation`
   and `good first issue`, plus a `testing` label, alongside the `area:`
   labels. The 17 existing issues were relabelled and the four points labels
   were deleted from the repository, so the tracker carries no Wave remnants.
4. **Contract behaviour, storage layout, error codes and ABI are unchanged.**
   There is no migration, no new entry point and no change to the settlement
   order.

## 6. File inventory

Added:

- `docs/06-stellar-integration.md`
- `.github/ISSUE_TEMPLATE/soroban_contract_issue.md`
- `.github/ISSUE_TEMPLATE/stellar_integration_issue.md`
- `.github/ISSUE_TEMPLATE/starter_issue.md`
- `scripts/create-stellar-backlog.sh`
- `update.md` (this file)

Rewritten or substantially edited:

- `README.md`
- `CONTRIBUTING.md`
- `SECURITY.md`
- `.env.example`
- `.github/pull_request_template.md`
- `.github/ISSUE_TEMPLATE/config.yml`
- `scripts/deploy.sh`
- `docs/index.md`, `docs/README.md`, `docs/.vitepress/config.mts`
- `docs/01-introduction.md` through `docs/05-architecture.md`
- `deployments/README.md`
- `packages/solver-bot/src/config.ts`, `src/evaluator.ts`, `src/index.ts`,
  `src/tests/evaluator.test.ts`
- `packages/solver-bot/package.json`, `package.json`
- `contracts/router/src/lib.rs`, `contracts/router/src/types.rs`,
  `contracts/mock_token/src/lib.rs` (doc comments only)

Deleted:

- `.github/ISSUE_TEMPLATE/wave_high_issue.md`
- `.github/ISSUE_TEMPLATE/wave_medium_issue.md`
- `.github/ISSUE_TEMPLATE/wave_trivial_issue.md`
- `scripts/create-wave-issues.sh`

## 7. Verification actually run

Run in this workspace, Node 24.22.2, pnpm 12.16.1:

| Command | Result |
| --- | --- |
| `pnpm build:packages` | pass |
| `pnpm lint:packages` (typecheck both packages) | pass |
| `pnpm test:packages` | pass: 19 SDK tests, 15 solver-bot tests |
| `pnpm exec prettier --check .` | pass |
| `pnpm docs:build` (VitePress, `ignoreDeadLinks: false`) | pass, 23.4s |
| `bash -n scripts/deploy.sh` | pass |
| `bash -n scripts/create-stellar-backlog.sh` | pass |
| `DRY_RUN=true ./scripts/deploy.sh` (mock mode) | pass, prints plan and summary |
| `DRY_RUN=true SELL_ASSET=native BUY_ASSET=USDC:G... ./scripts/deploy.sh` | pass, resolves both SACs |
| `DRY_RUN=true SELL_ASSET=native ./scripts/deploy.sh` | exit 1, "set SELL_ASSET and BUY_ASSET together" |
| `DRY_RUN=true ./scripts/create-stellar-backlog.sh` | pass, 8 labels and 15 issues |
| `gh issue list --state all` after relabelling | 17 issues, none carrying a points or `wave-ready` label |

Not run: `cargo fmt --all -- --check`, `cargo clippy --all-targets -- -D warnings`
and `cargo test --all`. The Rust toolchain is not installed in this workspace
(`cargo: command not found`), so the contract checks could not execute. The Rust
changes in this update are doc comments only; no code, storage key, error code or
ABI was modified. Run `pnpm test` (which runs `cargo test --all` first) somewhere
with Rust and the `wasm32v1-none` target before relying on a green CI result.

The docs build is the meaningful link check here: it fails the build on a dead
link, and it passed with the new page wired into the sidebar and both indexes.

## 8. Do you need Vercel?

No. Vercel has no role in deploying SlipGuard, and adding it would not strengthen
the Stellar story.

What the repository actually ships:

- **The protocol**: Rust contracts, deployed to Stellar with
  `stellar contract deploy` / `stellar contract asset deploy`. There is no
  server and no serverless function in this design.
- **Two libraries**: `@slipguard/sdk` and `@slipguard/solver-bot`, published as
  npm packages and run by integrators and solvers.
- **A documentation site**: VitePress, already published to GitHub Pages by
  `.github/workflows/deploy-docs.yml`. It is static output.

If you later want the docs on Vercel instead of GitHub Pages, this is the exact
shape:

- Project root: repository root. Install command:
  `pnpm install --frozen-lockfile`. Build command: `pnpm docs:build`. Output
  directory: `docs/.vitepress/dist`. Node 20 or newer.
- Change `base: "/stellar-slipguard/"` to `base: "/"` in
  `docs/.vitepress/config.mts`. Vercel serves the site at the domain root, so
  leaving the project-site base path in place produces 404s for every asset and
  link. This is the one change that will bite you.
- Disable or delete the Pages workflow if you switch, so two sites do not drift.

If you want a hosted trading demo on Vercel, that is a separate frontend project
that imports `@slipguard/sdk`, connects to a Stellar wallet, and talks to Stellar
RPC from the browser. That is optional demo surface, not part of the protocol,
and it is not needed for an appeal about whether the project is Stellar-native.

## 9. Suggested appeal wording

Adjust to taste, but this is the substance:

> SlipGuard is a Soroban-only protocol: `soroban-sdk` 26 contracts built for
> `wasm32v1-none`, settlement gated by dual `Address::require_auth()` checks,
> deadlines read from the ledger timestamp, order identity computed by
> `env.crypto().sha256()` over `ScVal` XDR, state in TTL-extended Soroban
> storage, and funds moved through the SEP-41 interface, including the Stellar
> Asset Contract. The SDK and solver talk only to Stellar RPC, and deployment is
> `stellar contract deploy`. There is no EVM component and no chain-abstraction
> layer.
>
> The repository previously carried a points-labelled issue backlog and some EVM
> vocabulary (`GAS_COST`, "ERC-20 style allowance", a `Keccak` reference). That
> vocabulary was wrong and is gone. `docs/06-stellar-integration.md` now maps
> every Stellar and Soroban primitive to the file that depends on it, and the
> deployment script resolves real Stellar Asset Contracts instead of only test
> tokens. `update.md` lists every change, including the verification output.

Two things to keep in your pocket if the question comes up:

- The SDK and the contract share a golden intent-hash vector, so an off-chain
  hash and `get_intent_hash` must agree or the build fails. That test only makes
  sense on Soroban, because it depends on `ScVal` encoding.
- The `MockToken` in `contracts/mock_token` is test infrastructure that
  implements `soroban_sdk::token::TokenInterface`. Its presence is not evidence
  of an ERC-20 port; it exists so the contract suite can settle against a token
  without a network.

## 10. Known gaps

- The contracts are unaudited and testnet-only. That is stated in `SECURITY.md`
  and in the README, and it should stay stated.
- The checked-in `deployments/testnet.json` records demo `MockToken` ids from the
  earlier deployment. Nothing is broken, but re-running the deploy script in SAC
  mode and updating that record would make the checked-in evidence match the new
  default path.
- `package-lock.json` exists as an untracked file from an earlier npm install
  while the project uses pnpm. It is not part of this update; delete it if you
  want a single lockfile in the tree.
