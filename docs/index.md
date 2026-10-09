---
layout: home

hero:
  name: SlipGuard
  text: Slippage protection, enforced on-chain
  tagline: A trader signs an intent, any solver can fill it, and a fill that breaks the trader's stated terms cannot settle.
  actions:
    - theme: brand
      text: Read the introduction
      link: /01-introduction
    - theme: alt
      text: View on GitHub
      link: https://github.com/SlipGuard-HQ/stellar-slipguard

features:
  - title: Intent-based orders
    details: The trader states the tokens, amounts, slippage tolerance, deadline, nonce and solver fee off-chain, and signs it. Nothing moves until a fill succeeds.
  - title: Terms live in the execution path
    details: execute_intent re-derives every constraint on chain, so a fill that misses the minimum output, overspends the slippage budget or lands after the deadline reverts atomically.
  - title: Non-custodial settlement
    details: There is no escrow and no allowance to manage. Both the trader and the solver authorize the exact argument set, and the router is the only component that moves funds.
---

## Start here

| Page | Read it if you want to |
| --- | --- |
| [1. Introduction](./01-introduction.md) | Understand the problem SlipGuard solves and why it is built on Soroban. |
| [2. Protocol mechanics](./02-protocol-mechanics.md) | See the intent lifecycle, the settlement order and the fee math with worked numbers. |
| [3. End-user guides](./03-end-user-guides.md) | Trade with intents, or run a solver and earn the fee. |
| [4. Developer guide](./04-developer-guide.md) | Build, test, deploy, and use the SDK and RPC patterns. |
| [5. Contract architecture](./05-architecture.md) | Review the contracts: responsibilities, dependency graph, storage, entry points and what is deliberately absent. |

A live testnet deployment is recorded in the
[`deployments/`](https://github.com/SlipGuard-HQ/stellar-slipguard/tree/main/deployments)
folder. The contracts are unaudited and have not been deployed to mainnet; see
[SECURITY.md](https://github.com/SlipGuard-HQ/stellar-slipguard/blob/main/SECURITY.md).
