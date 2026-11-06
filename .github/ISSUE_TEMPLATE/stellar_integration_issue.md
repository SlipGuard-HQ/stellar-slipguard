---
name: "Stellar integration change (medium)"
about: A multi-file change to the SDK, the solver bot or the deployment tooling.
title: "feat(<scope>): <short description>"
labels: ["difficulty: medium"]
---

## Summary

<!-- What is missing or wrong today, and what should exist instead? -->

## Stellar surface

<!-- Required. Which Stellar or Soroban interface does this work against? -->

- [ ] Stellar RPC (`simulateTransaction`, `assembleTransaction`, `sendTransaction`, `getTransaction`, `getEvents`, `getLatestLedger`)
- [ ] Soroban authorization entries (`xdr.SorobanAuthorizationEntry`, base64 XDR)
- [ ] SEP-41 / Stellar Asset Contract ids or Stellar asset codes (`native`, `CODE:ISSUER`)
- [ ] Strkeys, network passphrases or `@stellar/stellar-sdk` encoding
- [ ] `stellar` CLI (`contract deploy`, `contract asset deploy`, `contract invoke`, `keys`)
- [ ] None: this is CI or documentation only

## Where

<!-- Exact file paths, e.g. packages/sdk/src/client.ts -->

## Proposed Approach

<!-- One viable approach. Alternatives are welcome in review; state the tradeoffs. -->

## Acceptance Criteria

- [ ] Behaviour matches the description above
- [ ] Unit tests cover the happy path and the failure paths, without a live network
- [ ] Public interfaces documented (README, `docs/`, or JSDoc)
- [ ] `pnpm build:packages`, `pnpm lint:packages` and `pnpm test:packages` pass
- [ ] `cargo test --all` still passes if contracts are touched

## Tech Stack

TypeScript · `@stellar/stellar-sdk` 17 · Soroban RPC · pnpm · Vitest

## Out of Scope

<!-- Related work that belongs in a separate issue. -->
