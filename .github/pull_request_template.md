## Summary

<!-- What does this change do, and why is it needed? Keep it to a few sentences. -->

## Related Issue

<!-- e.g. Closes #42. Every PR should reference an issue. -->

## Area

- [ ] `contracts/router`
- [ ] `contracts/mock_token`
- [ ] `packages/sdk`
- [ ] `packages/solver-bot`
- [ ] CI / tooling
- [ ] Documentation

## Type of Change

- [ ] Bug fix
- [ ] New feature
- [ ] Refactor
- [ ] Documentation
- [ ] Chore

## How Has This Been Tested?

<!-- Exact commands, plus anything a reviewer should look at. -->

## Checklist

- [ ] `cargo fmt --all -- --check` passes
- [ ] `cargo clippy --all-targets -- -D warnings` passes
- [ ] `cargo test --all` passes
- [ ] `pnpm exec prettier --check .` passes
- [ ] `pnpm test:packages` passes
- [ ] New behaviour is covered by tests
- [ ] Documentation updated where relevant
- [ ] No `unwrap()` in non-test Rust code, no floating point in contract math
