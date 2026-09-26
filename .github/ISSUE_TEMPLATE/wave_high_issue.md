---
name: "Wave: High (200 pts)"
about: A substantial change touching contract economics, storage or security.
title: "feat(<scope>): <short description>"
labels: ["difficulty: high 200pts", "wave-ready"]
---

## Summary

<!-- What is missing or wrong today, and what should exist instead? -->

## Motivation

<!-- Why does this matter? Quantify the impact where you can. -->

## Where

<!-- Exact file paths, contracts and on-chain entry points involved. -->

## Design

<!-- Required. Describe storage layout changes, new entry points, auth
requirements per entry point, events emitted, and any migration or TTL
implications. Call out anything that changes on-chain behaviour. -->

### Storage

### Entry points and auth

### Events

### Migration and TTL

## Risks

<!-- What can break? Reentrancy, overflow, replay, griefing, TTL expiry. -->

## Acceptance Criteria

- [ ] Behaviour matches the design above
- [ ] Tests cover the happy path, every new error path, and auth failures
- [ ] Storage and TTL changes are documented
- [ ] `cargo clippy --all-targets -- -D warnings` is clean
- [ ] `cargo test --all` and `pnpm test:packages` pass
- [ ] SDK/client updated if the interface changed
- [ ] No `unwrap()` outside tests, no floating point in contract math

## Tech Stack

Rust · Soroban SDK 26 · TypeScript · pnpm · Stellar RPC

## Out of Scope

<!-- Related work that belongs in a separate issue. -->
