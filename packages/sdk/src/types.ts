/** A Stellar account (`G...`), muxed (`M...`) or contract (`C...`) address. */
export type StellarAddress = string;

/**
 * A signed, off-chain conditional order.
 *
 * Mirrors `TraderIntent` in `contracts/router/src/types.rs`. `sellAmount`,
 * `minBuyAmount` and `nonce` are 64/128-bit integers and are represented as
 * `bigint` so no precision is lost.
 */
export interface TraderIntent {
  /** Account that sells `sellToken` and receives `buyToken`. */
  trader: StellarAddress;
  /** Token pulled from the trader on fill. */
  sellToken: StellarAddress;
  /** Token the solver must deliver on fill. */
  buyToken: StellarAddress;
  /** Exact `sellToken` amount moved to the solver. */
  sellAmount: bigint;
  /** Gross `buyToken` amount the solver must deliver. */
  minBuyAmount: bigint;
  /** Tolerated shortfall, in basis points, between `minBuyAmount` and net proceeds. */
  maxSlippageBps: number;
  /** Unix timestamp (seconds) after which the intent cannot fill. */
  deadline: number;
  /** Per-trader single-use replay guard. */
  nonce: bigint;
  /** Fee, in basis points of the fill, retained by the solver. */
  solverFeeBps: number;
}

/** Lifecycle of an intent, matching `IntentStatus` in the router. */
export enum IntentStatus {
  Active = 0,
  Filled = 1,
  Cancelled = 2,
  Expired = 3,
}

/** Proof of settlement written by the router on a successful fill. */
export interface FillReceipt {
  /** Hex-encoded SHA-256 hash of the filled intent. */
  intentHash: string;
  /** Solver that executed the fill. */
  solver: StellarAddress;
  /** Gross `buyToken` amount delivered by the solver. */
  boughtAmount: bigint;
  /** Ledger timestamp of settlement. */
  timestamp: number;
}

/** Options accepted by {@link SlipGuardClient}. */
export interface SlipGuardClientOptions {
  /** Deployed router contract id (`C...`). */
  contractId: string;
  /** Soroban RPC endpoint. */
  rpcUrl: string;
  /** Network passphrase the transactions are signed for. */
  networkPassphrase: string;
  /** Source account used for read simulations. */
  publicKey?: string;
  /** Allow plain HTTP endpoints, useful for local sandboxes. */
  allowHttp?: boolean;
}

/** Result of polling a submitted transaction. */
export interface SubmitResult {
  hash: string;
  status: "SUCCESS" | "FAILED" | "NOT_FOUND";
  ledger?: number;
}

/** Well-known network presets. Override any of these with your own provider. */
export const NETWORKS = {
  testnet: {
    rpcUrl: "https://soroban-testnet.stellar.org",
    networkPassphrase: "Test SDF Network ; September 2015",
  },
  futurenet: {
    rpcUrl: "https://rpc-futurenet.stellar.org",
    networkPassphrase: "Test SDF Future Network ; October 2022",
  },
  mainnet: {
    rpcUrl: "https://mainnet.sorobanrpc.com",
    networkPassphrase: "Public Global Stellar Network ; September 2015",
  },
} as const;

/** Names available in {@link NETWORKS}. */
export type NetworkName = keyof typeof NETWORKS;
