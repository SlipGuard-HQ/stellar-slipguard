## Summary

<!-- What does this change do, and why is it needed? Keep it to a few sentences. -->

## Related Issue

<!-- e.g. Closes #42. Every PR should reference an issue. -->

## Area

- [ ] `contracts/router` (Soroban entry points, storage, auth)
- [ ] `contracts/mock_token` (SEP-41 token used by tests)
- [ ] `packages/sdk` (Stellar RPC client, ScVal encoding)
- [ ] `packages/solver-bot` (event watching, fill submission)
- [ ] `scripts/` (Stellar CLI deployment tooling)
- [ ] CI / tooling
- [ ] Documentation

## Stellar Surface

<!-- Which Stellar or Soroban interfaces does this PR touch? -->

- [ ] `Address::require_auth()` / authorization-entry scoping
- [ ] Storage layout or TTL extension
- [ ] `ScVal` encoding, intent hashing, SEP-41 / Stellar Asset Contract calls
- [ ] Stellar RPC endpoints or event filters
- [ ] `stellar` CLI usage in `scripts/`
- [ ] None (docs or CI only)

## Type of Change

- [ ] Bug fix
- [ ] New feature
- [ ] Refactor
- [ ] Documentation
- [ ] Chore

## How Has This Been Tested?

<!-- Exact commands, plus anything a reviewer should look at. Say whether you
tested against testnet, or only against soroban-sdk testutils. -->

## Checklist

- [ ] `cargo fmt --all -- --check` passes
- [ ] `cargo clippy --all-targets -- -D warnings` passes
- [ ] `cargo test --all` passes
- [ ] `pnpm exec prettier --check .` passes
- [ ] `pnpm test:packages` passes
- [ ] New behaviour is covered by tests
- [ ] Documentation updated where relevant
- [ ] No `unwrap()` in non-test Rust code, no floating point in contract math
- [ ] No EVM terminology or EVM-only concepts introduced
