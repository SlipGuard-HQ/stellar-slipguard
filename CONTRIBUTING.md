# Contributing to SlipGuard

Thanks for taking the time to contribute. This repository is part of the Stellar
Wave program, so the process below is deliberately explicit: clear issues,
small pull requests, and tests that a reviewer can run.

## Before you start

1. Read the README [contract reference](./README.md#contract-reference) so you
   know which entry point you are changing.
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

## Branch conventions

Branch off `main` and use one of these prefixes:

| Prefix | Use for |
| --- | --- |
| `feat/` | New functionality, e.g. `feat/router-partial-fills` |
| `fix/` | Bug fixes, e.g. `fix/sdk-i128-encoding` |
| `wave/` | Work claimed from a Wave-labelled issue, e.g. `wave/42-emit-cancel-reason` |
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

## Stellar Wave sprint guidelines

Wave runs in short cycles. To keep points fair for everyone:

1. **Claim before you build.** Comment on the issue and wait for a maintainer to
   assign it. Do not open a PR for an unassigned issue.
2. **One issue at a time.** Finish and land your current issue before claiming
   another, unless a maintainer explicitly says otherwise.
3. **Ship within the sprint.** If you cannot land the change in the current
   cycle, say so on the issue so someone else can pick it up.
4. **Issues carry a difficulty label**: `difficulty: trivial 100pts`,
   `difficulty: medium 150pts`, `difficulty: high 200pts`. Points are awarded on
   a merged, reviewed PR, not on an opened one.
5. **Tests are not optional.** A PR without tests for new behaviour will be sent
   back, regardless of how small the change is.
6. **No drive-by reformatting.** Prettier and rustfmt are configured; run them,
   but do not reformat files you did not otherwise change.

## Coding standards

### Rust (contracts)

- No `unwrap()` or `expect()` outside test code. Handle `Option` and `Result`
  explicitly.
- No floating point. All ratios are integer basis points over `i128`.
- Use checked arithmetic (`checked_mul`, `checked_add`, ...) and surface
  overflows as `SlipGuardError::MathOverflow`.
- Write state before making external calls (checks-effects-interactions).
- Every public entry point needs doc comments explaining auth and failure modes.
- Extend persistent TTLs whenever you write persistent state.

### TypeScript (SDK and solver)

- `strict` mode is on, as is `noUncheckedIndexedAccess`. No `any`.
- Prefer `bigint` for all chain integer types; never use `number` for `i128`.
- Validate inputs at the boundary and throw a typed error (`IntentValidationError`
  for intents, `ConfigError` for configuration).
- No `console.log` in library code; the bot uses the structured logger.
- Keep pure logic (hashing, encoding, profitability math) free of I/O so it can
  be unit tested without a network.

## Reporting bugs

Open an issue with the reproduction steps, the exact commands you ran, and the
full error output. If it is a security issue, do not open a public issue. See
[SECURITY.md](./SECURITY.md).

## License

By contributing you agree that your contributions are licensed under the
[MIT License](./LICENSE).
