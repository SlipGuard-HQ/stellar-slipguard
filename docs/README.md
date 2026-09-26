# SlipGuard documentation

Intent-based conditional orders with enforced slippage protection on Stellar.

This documentation has two audiences. The first three pages explain what
SlipGuard is and how it behaves, without assuming you read Rust. The last three
are for people who are going to run it, build on it or review its design.

| Page | Read it if you want to |
| --- | --- |
| [1. Introduction](./01-introduction.md) | Understand the problem SlipGuard solves and why it is built on Soroban. |
| [2. Protocol mechanics](./02-protocol-mechanics.md) | See the intent lifecycle, the settlement order and the fee math with worked numbers. |
| [3. End-user guides](./03-end-user-guides.md) | Trade with intents, or run a solver and earn the fee. |
| [4. Developer guide](./04-developer-guide.md) | Build, test, deploy, and use the SDK and RPC patterns. |
| [5. Contract architecture](./05-architecture.md) | Review the contracts: responsibilities, dependency graph, storage, entry points and what is deliberately absent. |

Repository: <https://github.com/SlipGuard-HQ/stellar-slipguard>

The contracts are unaudited and have not been deployed to mainnet. See
[SECURITY.md](../SECURITY.md).
