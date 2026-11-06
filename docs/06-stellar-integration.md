# 6. Stellar integration map

SlipGuard is not a chain-agnostic protocol that happens to run on Stellar. Every
guarantee it offers comes from a specific Stellar or Soroban primitive, and
removing that primitive breaks the guarantee rather than degrading it. This page
maps each primitive to the code that depends on it, so the dependency can be
checked instead of taken on trust.

## Contract layer

| Primitive | Where | What depends on it |
| --- | --- | --- |
| `soroban-sdk` 26, `#![no_std]`, `wasm32v1-none` build target | `contracts/router/Cargo.toml`, `contracts/mock_token/Cargo.toml`, `Cargo.toml`, `rust-toolchain.toml` | Everything. The contract cannot be compiled for any other runtime. |
| `#[contract]` / `#[contractimpl]` entry points | `contracts/router/src/lib.rs` | The router has no API other than its Soroban entry points. |
| `#[contracttype]` structs and enums | `contracts/router/src/types.rs`, `contracts/router/src/storage.rs` | The intent's canonical `ScVal` encoding, and therefore its hash. |
| `#[contracterror]` | `contracts/router/src/errors.rs` | Typed failure codes that the SDK and the solver bot match on. |
| `#[contractevent]` | `contracts/router/src/lib.rs` | `Initialized`, `IntentCancelled`, `IntentFilled`, read from Stellar RPC `getEvents`. |
| `Address::require_auth()` | `init`, `cancel_intent`, `execute_intent` | The whole non-custodial model. `execute_intent` requires the solver *and* the trader. |
| Invocation-scoped authorization entries | `packages/sdk/src/client.ts` (`authEntries`, `xdr.SorobanAuthorizationEntry`), `packages/solver-bot/src/executor.ts` | A trader can pre-sign one intent and let any solver fill it, offline. |
| `env.ledger().timestamp()` | `execute_intent`, `deployments/testnet.json` (`deployedAt` is wall clock; the contract reads the ledger) | Deadline enforcement. A client cannot argue about the clock. |
| `env.ledger().sequence()` | `contracts/mock_token/src/lib.rs` allowance expiry | SEP-41 allowance expiry is a ledger number, not a timestamp. |
| Instance storage | `Admin` key in `contracts/router/src/storage.rs` | The admin is read without being independently evictable. |
| Persistent storage + `extend_ttl` (30-day threshold, 90-day extension, 17,280 ledgers ≈ 1 day) | `IntentStatus`, `FillReceipt`, `UsedNonce` | Fill state and the replay guard survive archival. |
| `env.crypto().sha256()` over `ToXdr` | `get_intent_hash` | Order identity, reproduced off chain by `hashIntent`. |
| `soroban_sdk::token::TokenClient` (SEP-41) | `execute_intent` transfers | Works with the Stellar Asset Contract and any SEP-41 token, with no asset-specific code. |
| `TokenInterface` implementation | `contracts/mock_token/src/lib.rs` | A local SEP-41 token for tests, so the suite needs no network. |
| `MuxedAddress` (CAP-27) | `execute_intent`, `MockToken::transfer` | Payments to muxed destinations. |

## Client layer

All of this is `@stellar/stellar-sdk` v17, not a generic HTTP client.

| Primitive | Where | What depends on it |
| --- | --- | --- |
| `rpc.Server` | `packages/sdk/src/client.ts`, `packages/solver-bot/src/watcher.ts` | Every read and write. There is no second transport. |
| `simulateTransaction` | `simulateRead`, `prepareExecuteIntent` | Read calls, and the resource estimate and auth entries for writes. |
| `assembleTransaction` | `prepareExecuteIntent` | Turning a simulation into a signable transaction with Soroban resource data. |
| `sendTransaction` + `getTransaction` polling | `submitTransaction`, `poll` | Ledger inclusion is the only success signal the SDK accepts. |
| `getEvents` filtered by contract id | `IntentWatcher.pollEvents` | Observing `IntentFilled` and `IntentCancelled` without an indexer. |
| `getLatestLedger` | `IntentWatcher` | The event cursor starts at the chain tip rather than an arbitrary number. |
| `Contract.call` | `SlipGuardClient` operation builders | Every entry point invocation. |
| `Address` strkeys (`G...`, `M...`, `C...`) | `assertAddress`, `loadConfig` | Validation of traders, tokens and the router id. |
| `nativeToScVal` / `xdr.ScVal.scvMap` | `packages/sdk/src/intent.ts` | Byte-for-byte agreement with the contract's `ScVal` encoding. |
| Network passphrases | `NETWORKS`, `NETWORK_PASSPHRASE` | A transaction signed for the wrong network is rejected by the host. |
| `Keypair.fromSecret` | `IntentExecutor` | Solver signing. The key is a Stellar `S...` secret seed. |

## Operations layer

| Tooling | Where | What depends on it |
| --- | --- | --- |
| `stellar contract deploy` | `scripts/deploy.sh` | Installing and deploying the router WASM. |
| `stellar contract asset deploy` | `scripts/deploy.sh` | Deploying or reusing the Stellar Asset Contract for a pair. |
| `stellar contract invoke` | `scripts/deploy.sh`, this documentation | `init`, `initialize`, `mint`, and `get_admin` verification. |
| `stellar keys address` | `scripts/deploy.sh` | Resolving the deployer's public key for the admin. |
| `soroban-sdk` testutils (`Env::default`, `mock_all_auths`, clients) | `contracts/router/src/test.rs` | Contract tests run against a real Soroban host, offline. |
| Stellar RPC endpoints | `.env.example`, `NETWORKS` | `https://soroban-testnet.stellar.org` by default. |
| Stellar network passphrases | `NETWORKS`, `deployments/testnet.json` | `Test SDF Network ; September 2015` for the checked-in deployment. |

## What is deliberately absent

| Not present | Why |
| --- | --- |
| Solidity, EVM bytecode, `msg.sender`, wei, gas units | SlipGuard has no EVM component. Fees are stroops and the Soroban resource fee, and identity is `Address`. |
| A chain abstraction layer | Supporting a second chain would mean a second settlement contract and a second auth model. v0.1 does not abstract that away. |
| An off-chain matching engine that settles balances | State transitions exist only as Soroban contract invocations. The feed distributes signed intents; it cannot move funds. |
| A custodial relayer holding trader funds | The trader's authorization entry, not a balance transfer, is what lets a solver fill. |
| An indexer service | `getEvents` on Stellar RPC covers the observability the solver needs. |

## Where to look next

- The settlement sequence and the fee math: [Protocol mechanics](./02-protocol-mechanics.md).
- Entry points, auth and storage keys: [Contract architecture](./05-architecture.md).
- How to call Stellar RPC without the SDK: [Developer guide](./04-developer-guide.md#calling-the-contract-directly).
