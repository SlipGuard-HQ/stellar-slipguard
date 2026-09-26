import { NETWORKS } from "@slipguard/sdk";

import { parseLogLevel } from "./logger.js";
import type { LogLevel } from "./logger.js";

/** Raised when the environment is missing or malformed. */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

/** Fully resolved runtime configuration. */
export interface SolverConfig {
  /** Soroban RPC endpoint. */
  rpcUrl: string;
  /** Network passphrase the solver signs for. */
  networkPassphrase: string;
  /** Router contract id (`C...`). */
  routerContractId: string;
  /** Solver secret key (`S...`). */
  solverSecretKey: string;
  /** Optional HTTP feed of signed intents. */
  intentFeedUrl?: string;
  /** Milliseconds between polls. */
  pollIntervalMs: number;
  /** First ledger to scan for router events. */
  startLedger?: number;
  /** Minimum acceptable net profit, in buy-token units. */
  minProfit: bigint;
  /** Estimated transaction cost, in buy-token units. */
  gasCost: bigint;
  /** Max transaction fee, in stroops. */
  maxFeeStroops: string;
  /** Milliseconds to wait for ledger inclusion. */
  txTimeoutMs: number;
  /** USD price per token contract id, used to value fills. */
  tokenPrices: Record<string, number>;
  /** Log level. */
  logLevel: LogLevel;
  /** When true, evaluates and logs but never submits. */
  dryRun: boolean;
  /** Allow plain HTTP RPC endpoints. */
  allowHttp: boolean;
}

function readString(env: NodeJS.ProcessEnv, key: string, fallback?: string): string | undefined {
  const raw = env[key];
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }
  return raw.trim();
}

function readRequired(env: NodeJS.ProcessEnv, key: string): string {
  const value = readString(env, key);
  if (value === undefined) {
    throw new ConfigError(`${key} is required`);
  }
  return value;
}

function readInteger(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const value = readString(env, key);
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ConfigError(`${key} must be a positive integer`);
  }
  return parsed;
}

function readBigInt(env: NodeJS.ProcessEnv, key: string, fallback: bigint): bigint {
  const value = readString(env, key);
  if (value === undefined) {
    return fallback;
  }
  try {
    return BigInt(value);
  } catch {
    throw new ConfigError(`${key} must be an integer`);
  }
}

function readBoolean(env: NodeJS.ProcessEnv, key: string, fallback: boolean): boolean {
  const value = readString(env, key)?.toLowerCase();
  if (value === undefined) {
    return fallback;
  }
  if (value === "true" || value === "1" || value === "yes") return true;
  if (value === "false" || value === "0" || value === "no") return false;
  throw new ConfigError(`${key} must be a boolean`);
}

function readTokenPrices(env: NodeJS.ProcessEnv): Record<string, number> {
  const value = readString(env, "TOKEN_PRICES");
  if (value === undefined) {
    return {};
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new ConfigError("TOKEN_PRICES must be a JSON object of token id to price");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new ConfigError("TOKEN_PRICES must be a JSON object of token id to price");
  }
  const prices: Record<string, number> = {};
  for (const [token, price] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) {
      throw new ConfigError(`TOKEN_PRICES entry for ${token} must be a positive number`);
    }
    prices[token] = price;
  }
  return prices;
}

/**
 * Resolves configuration from the environment.
 *
 * `STELLAR_NETWORK` (`testnet` | `futurenet` | `mainnet`) fills in the RPC URL
 * and passphrase, and any explicit `SOROBAN_RPC_URL` / `NETWORK_PASSPHRASE`
 * overrides them.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): SolverConfig {
  const networkName = readString(env, "STELLAR_NETWORK")?.toLowerCase();
  const preset =
    networkName === "testnet" || networkName === "futurenet" || networkName === "mainnet"
      ? NETWORKS[networkName]
      : undefined;

  if (networkName !== undefined && preset === undefined) {
    throw new ConfigError("STELLAR_NETWORK must be one of testnet, futurenet, mainnet");
  }

  const rpcUrl = readString(env, "SOROBAN_RPC_URL", preset?.rpcUrl);
  if (rpcUrl === undefined) {
    throw new ConfigError("SOROBAN_RPC_URL is required when STELLAR_NETWORK is not set");
  }
  const networkPassphrase = readString(env, "NETWORK_PASSPHRASE", preset?.networkPassphrase);
  if (networkPassphrase === undefined) {
    throw new ConfigError("NETWORK_PASSPHRASE is required when STELLAR_NETWORK is not set");
  }

  const routerContractId = readRequired(env, "ROUTER_CONTRACT_ID");
  if (!/^C[A-Z2-7]{55}$/.test(routerContractId)) {
    throw new ConfigError("ROUTER_CONTRACT_ID must be a Stellar contract id (C...)");
  }

  const solverSecretKey = readRequired(env, "SOLVER_SECRET_KEY");
  if (!/^S[A-Z2-7]{55}$/.test(solverSecretKey)) {
    throw new ConfigError("SOLVER_SECRET_KEY must be a Stellar secret key (S...)");
  }

  const startLedgerRaw = readString(env, "START_LEDGER");

  return {
    rpcUrl,
    networkPassphrase,
    routerContractId,
    solverSecretKey,
    intentFeedUrl: readString(env, "INTENT_FEED_URL"),
    pollIntervalMs: readInteger(env, "POLL_INTERVAL_MS", 5_000),
    startLedger: startLedgerRaw === undefined ? undefined : Number.parseInt(startLedgerRaw, 10),
    minProfit: readBigInt(env, "MIN_PROFIT", 0n),
    gasCost: readBigInt(env, "GAS_COST", 0n),
    maxFeeStroops: readString(env, "MAX_FEE_STROOPS", "100000") as string,
    txTimeoutMs: readInteger(env, "TX_TIMEOUT_MS", 60_000),
    tokenPrices: readTokenPrices(env),
    logLevel: parseLogLevel(readString(env, "LOG_LEVEL")),
    dryRun: readBoolean(env, "DRY_RUN", false),
    allowHttp: readBoolean(env, "ALLOW_HTTP", false),
  };
}
