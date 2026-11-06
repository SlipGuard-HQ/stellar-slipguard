---
name: "Soroban contract change"
about: A substantial change to settlement, storage, authorization or TTL behaviour in contracts/.
title: "feat(router): <short description>"
labels: ["enhancement", "area: contracts"]
---

## Summary

<!-- What is missing or wrong today, and what should exist instead? -->

## Stellar surface

<!-- Required. Tick every Stellar or Soroban primitive this change touches, and
say how. If none are touched, this is the wrong template. -->

- [ ] `Address::require_auth()` or authorization-entry scoping
- [ ] Storage layout, instance vs persistent, or `extend_ttl` policy
- [ ] `#[contracttype]` encoding, `ScVal` hashing or `env.crypto().sha256()`
- [ ] SEP-41 / Stellar Asset Contract calls (`TokenClient`, `MuxedAddress`)
- [ ] `env.ledger()` timestamp or sequence use
- [ ] `#[contracterror]` or `#[contractevent]` surface
- [ ] Nothing on chain: SDK, solver bot, CI or docs only (use another template)

## Where

<!-- Exact files under contracts/, and the entry points involved. -->

## Motivation

<!-- Why does this matter for traders or solvers on Stellar? Quantify when you can. -->

## Design

<!-- Required. Describe the storage keys, new entry points, the auth each one
requires, events emitted, and any migration or TTL implication. State anything
that changes on-chain behaviour. -->

### Storage and TTL

### Entry points and auth

### Events

### Migration

## Risks

<!-- Reentrancy, overflow, replay, griefing, archival expiry. -->

## Acceptance Criteria

- [ ] Behaviour matches the design above
- [ ] Tests cover the happy path, every new error path, and auth failures
- [ ] Storage and TTL changes documented in `docs/05-architecture.md`
- [ ] `cargo fmt --all -- --check` and `cargo clippy --all-targets -- -D warnings` pass
- [ ] `cargo test --all` and `pnpm test:packages` pass
- [ ] SDK or solver updated if the interface changed
- [ ] No `unwrap()` outside tests, no floating point in contract math, `#![no_std]` preserved

## Tech Stack

Rust · Soroban SDK 26 · `wasm32v1-none` · Stellar CLI · Stellar RPC

## Out of Scope

<!-- Related work that belongs in a separate issue. -->
