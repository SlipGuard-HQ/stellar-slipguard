---
name: "Wave: Medium (150 pts)"
about: A multi-file change with some design decisions to make.
title: "feat(<scope>): <short description>"
labels: ["difficulty: medium 150pts", "wave-ready"]
---

## Summary

<!-- What is missing or wrong today, and what should exist instead? -->

## Motivation

<!-- Why does this matter for traders, solvers, or reviewers? -->

## Where

<!-- Exact file paths and contracts involved. -->

## Proposed Approach

<!-- One viable approach. Alternatives are welcome in review — state the tradeoffs. -->

## Acceptance Criteria

- [ ] Behaviour matches the description above
- [ ] Unit tests cover the happy path and the failure paths
- [ ] Public interfaces documented (README or JSDoc/Rust doc comments)
- [ ] `cargo clippy --all-targets -- -D warnings` is clean
- [ ] `cargo test --all` and `pnpm test:packages` pass
- [ ] No `unwrap()` outside tests, no floating point in contract math

## Tech Stack

Rust · Soroban SDK 26 · TypeScript · pnpm · Stellar RPC

## Out of Scope

<!-- Related work that belongs in a separate issue. -->
