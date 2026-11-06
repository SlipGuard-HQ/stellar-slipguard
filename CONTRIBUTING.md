# Contributing to SlipGuard

Thanks for taking the time to contribute. SlipGuard is a Stellar and Soroban
project: one Soroban contract settles, a TypeScript SDK talks to it over Stellar
RPC, and a reference solver submits fills. The process below is deliberately
explicit, because a contract change is a funds-safety change.

## Before you start

1. Read the README [contract reference](./README.md#contract-reference) so you
   know which entry point you are changing, and the
   [Stellar integration map](./docs/06-stellar-integration.md) so you know which
   Stellar primitive your change touches.
2. Find or open an issue. Work that is not attached to an issue will not be
   reviewed.
3. Say so on the issue that you are taking it, so two people do not duplicate
   the same work.

## Local setup

```bash
rustup target add wasm32v1-none
pnpm install

cargo test --all
pnpm test:packages
```

Run the full gate before you push:

```bash
cargo fmt --all -- --check
cargo clippy --all-targets -- -D warnings
cargo test --all
pnpm exec prettier --check .
pnpm build:packages
pnpm lint:packages
pnpm test:packages
```

## Stellar and Soroban surface rules

This repository has no EVM component and no chain-agnostic layer. Contributions
must keep it that way, and must say which Stellar surface they touch.

| If you touch | Then you must |
| --- | --- |
| `Address::require_auth()` or authorization entries | Name the invocation and argument set the entry is scoped to, and test the rejection when any field changes |
| Storage keys or `extend_ttl` | Update the storage table in `docs/05-architecture.md` and state the TTL implication |
| `#[contracttype]` structs or enums | Update both the Rust and the SDK `ScVal` encoders, and the shared hash vector |
| SEP-41 or Stellar Asset Contract calls | Test against `MockToken` and state which real asset contract id the path targets |
| Stellar RPC endpoints | Keep reads as `simulateTransaction` and writes as simulate/assemble/send/poll |
| `scripts/deploy.sh` | Verify the `stellar` CLI subcommand exists in the pinned CLI version and that `DRY_RUN=true` stays accurate |
| Documentation | Use Stellar terminology: ledger, stroops, Soroban resource fee, SEP-41, Stellar Asset Contract |

Words to avoid: gas, wei, EVM address, allowance (except when describing the
SEP-41 `allowance` function itself), smart contract language other than Rust and
Soroban.

## Branch conventions

Branch off `main` and use one of these prefixes:

| Prefix | Use for |
| --- | --- |
| `feat/` | New functionality, e.g. `feat/router-partial-fills` |
| `fix/` | Bug fixes, e.g. `fix/sdk-i128-encoding` |
| `test/` | Test-only changes, e.g. `test/ttl-boundaries` |
| `docs/` | Documentation only |
| `chore/` | Tooling, CI, dependency bumps |

Keep branch names lower-case and hyphenated.

## Commit messages

Use conventional commits, scoped to the area you touched:

```
feat(router): enforce deadline before fee math
fix(sdk): encode i128 with nativeToScVal
docs(readme): document the settlement order
test(mock-token): cover expired allowances
```

One logical change per commit. If a commit needs the word "and" to describe it,
it should be two commits.

## Pull requests

- Reference the issue in the PR body (`Closes #42`).
- Keep the diff focused. Unrelated refactors belong in a separate PR.
- Fill in the PR template checklist and paste the commands you actually ran.
- New contract behaviour needs unit tests in `contracts/router/src/test.rs`.
- New SDK behaviour needs tests in `packages/sdk/src/tests/`.
- New solver logic needs tests in `packages/solver-bot/src/tests/`.

### Review timeline

Reviewers aim for a first response within 48 hours. Stale PRs (no activity from
the author for seven days) are marked stale and closed after a further seven
days; you are welcome to reopen them.

## Claiming work

The backlog is grouped by Stellar surface (`area: contracts`, `area: sdk`,
`area: solver-bot`, `area: stellar-rpc`, `area: soroban-auth`, `area: ci`,
`area: docs`) and typed with GitHub's standard labels (`enhancement`, `bug`,
`documentation`, `testing`). The smallest well-scoped tasks also carry
`good first issue`. To keep review fair:

1. **Claim before you build.** Comment on the issue and wait for a maintainer to
   assign it. Do not open a PR for an unassigned issue.
2. **One issue at a time.** Finish and land your current issue before claiming
   another, unless a maintainer explicitly says otherwise.
3. **Say if you are stuck.** If you cannot land the change, report it on the
   issue so someone else can pick it up.
4. **Tests are not optional.** A PR without tests for new behaviour will be sent
   back, regardless of how small the change is.
5. **No drive-by reformatting.** Prettier and rustfmt are configured; run them,
   but do not reformat files you did not otherwise change.

## Coding standards

### Rust (Soroban contracts)

- `#![no_std]` stays. No standard library, no floating point, no `std` types.
- No `unwrap()` or `expect()` outside test code. Handle `Option` and `Result`
  explicitly.
- No floating point. All ratios are integer basis points over `i128`.
- Use checked arithmetic (`checked_mul`, `checked_add`, ...) and surface
  overflows as `SlipGuardError::MathOverflow`.
- Write state before making external calls (checks-effects-interactions).
- Every public entry point needs doc comments explaining auth and failure modes.
- Extend persistent TTLs whenever you write persistent state, and document the
  threshold and extension you chose.
- Authorization is `require_auth()` inside the function, never an assumption
  about the caller.

### TypeScript (SDK and solver)

- `strict` mode is on, as is `noUncheckedIndexedAccess`. No `any`.
- Prefer `bigint` for all chain integer types; never use `number` for `i128`.
- Validate inputs at the boundary and throw a typed error (`IntentValidationError`
  for intents, `ConfigError` for configuration).
- No `console.log` in library code; the bot uses the structured logger.
- Keep pure logic (hashing, encoding, profitability math) free of I/O so it can
  be unit tested without a network.
- Network access goes through `@stellar/stellar-sdk` `rpc.Server`, not `fetch`,
  except for the intent feed.

## Reporting bugs

Open an issue with the reproduction steps, the exact commands you ran, and the
full error output. Include the network (testnet, futurenet, mainnet) and the
contract id. If it is a security issue, do not open a public issue. See
[SECURITY.md](./SECURITY.md).

## License

By contributing you agree that your contributions are licensed under the
[MIT License](./LICENSE).
