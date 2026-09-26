# Drips Wave submission

Ready-to-paste copy for the Wave submission form, grounded in what is actually in
the repository. Update the two "pending" links before submitting.

## Project description

SlipGuard is a non-custodial, intent-based conditional order protocol for Stellar.
A trader signs an off-chain intent that fixes the sell amount, a minimum buy
amount, a slippage tolerance in basis points, a solver fee and a deadline; any
solver can fill it on chain, and `SlipGuardRouter` reverts the fill unless every
one of those terms holds. That closes the gap between a market order, which
guarantees no price, and a resting limit order, which on a five-second ledger
needs a keeper with a reason to act. Soroban's `require_auth` is the mechanism:
`execute_intent` requires both the solver and the trader to authorize the exact
token, amount, deadline and nonce set, so a pre-signed authorization can be handed
to any solver without giving up control of the fill price, and there is no escrow
account and no ERC-20 allowance to manage. The repository contains the Rust
contracts, a TypeScript SDK that reproduces the contract's intent hash
byte-for-byte, and a reference solver bot whose profitability check mirrors the
contract's own rules.

## Repository relationship

One monorepo, not two repositories. The contracts, the SDK and the solver bot
share a single canonical intent encoding: the golden hash vector
`5a1b7ff3...60ee5` is asserted in the Rust test suite, in the TypeScript test
suite, and on the deployed testnet router. Splitting them across repositories
would put that shared invariant behind a package boundary for no benefit, and the
app layer here is a library and a daemon rather than a hosted frontend.

- `contracts/router` — `SlipGuardRouter`, the settlement layer.
- `contracts/mock_token` — a SEP-41 token used only by the test suite.
- `packages/sdk` — `@slipguard/sdk`, intent building, canonical encoding, hashing
  and the Soroban RPC client.
- `packages/solver-bot` — `@slipguard/solver-bot`, the reference keeper daemon.

## Planned issues

The backlog is live in the issue tracker, every issue labelled `wave-ready` with
an area and a difficulty tier. 17 issues were created in the initial batch.

- **Contracts (4):** batch-read intent statuses for indexers; property tests for
  the basis-point and slippage math; an admin pause switch; partial fills.
- **SDK (4):** JSDoc for every export; fuzz intent deserialization; decode
  `FillReceipt` from a transaction result; sign and attach the trader's
  authorization entry.
- **Solver bot (5):** exponential backoff on RPC rate limits; persist seen intent
  hashes across restarts; price intents from Soroswap reserves instead of a static
  table; a Prometheus metrics endpoint; multiple concurrent solver keys.
- **CI (2):** a Rust coverage job; publish release WASM and attach the contract
  ids to the tag.
- **Docs (2):** a GitBook-ready protocol mechanics page; the trader and solver
  operator guides.

## Supporting links

| Item | Link | Status |
| --- | --- | --- |
| Repository | <https://github.com/SlipGuard-HQ/stellar-slipguard> | Live |
| Documentation | <https://github.com/SlipGuard-HQ/stellar-slipguard/tree/main/docs> | Live |
| Release | <https://github.com/SlipGuard-HQ/stellar-slipguard/releases/tag/v0.1.0> | Live |
| Testnet router | <https://stellar.expert/explorer/testnet/contract/CBNWLNZKYA2FASRFVURBBX4JGHXJAZGJAKCKANB4MQGIKI7NXBFB5HON> | Live |
| Deployment record | [`deployments/`](./deployments/README.md) | Live |
| Hosted app | — | Not applicable: the product is a contract, an SDK and a CLI daemon, with no web frontend in v0.1. |
| Demo video | — | Pending: record a CLI walkthrough (build, deploy, hash parity on chain, solver bot in `DRY_RUN`). |

## Honest status

The contracts are unaudited and deployed to testnet only. Anything that claims
otherwise does not belong in the submission. See [SECURITY.md](./SECURITY.md).
