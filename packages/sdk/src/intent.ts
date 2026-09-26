import { createHash } from "node:crypto";

import { Address, nativeToScVal, xdr } from "@stellar/stellar-sdk";

import type { StellarAddress, TraderIntent } from "./types.js";

/** Basis-point denominator. `100` bps equals `1%`. */
export const BPS_DENOMINATOR = 10_000;

/** Default deadline horizon used when none is supplied to the builder. */
export const DEFAULT_INTENT_TTL_SECONDS = 300;

/** Raised when an intent fails client-side validation. */
export class IntentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IntentValidationError";
  }
}

/** Anything that can be losslessly converted to a `bigint`. */
export type Amount = bigint | number | string;

/**
 * Canonical field order for the intent's `ScVal` map.
 *
 * Soroban encodes `#[contracttype]` structs as an `ScMap` with symbol keys
 * sorted byte-wise. This order is sorted and must not be changed without a
 * matching contract upgrade.
 */
const SCVAL_FIELD_ORDER = [
  "buy_token",
  "deadline",
  "max_slippage_bps",
  "min_buy_amount",
  "nonce",
  "sell_amount",
  "sell_token",
  "solver_fee_bps",
  "trader",
] as const;

/** Converts a user supplied amount into a `bigint`. */
export function toBigInt(value: Amount, field: string): bigint {
  if (typeof value === "bigint") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isInteger(value)) {
      throw new IntentValidationError(`${field} must be an integer`);
    }
    return BigInt(value);
  }
  try {
    return BigInt(value);
  } catch {
    throw new IntentValidationError(`${field} is not a valid integer: ${String(value)}`);
  }
}

/** Validates a Stellar address and returns it unchanged. */
export function assertAddress(value: string, field: string): StellarAddress {
  try {
    // `Address` accepts account (`G...`), muxed (`M...`) and contract (`C...`) strkeys.
    new Address(value);
  } catch {
    throw new IntentValidationError(`${field} is not a valid Stellar address: ${value}`);
  }
  return value;
}

/** Validates a basis-point value is an integer within `[0, 10_000]`. */
export function assertBps(value: number, field: string): number {
  if (!Number.isInteger(value)) {
    throw new IntentValidationError(`${field} must be an integer number of basis points`);
  }
  if (value < 0 || value > BPS_DENOMINATOR) {
    throw new IntentValidationError(`${field} must be between 0 and ${BPS_DENOMINATOR}`);
  }
  return value;
}

/**
 * Validates a fully-formed intent, throwing {@link IntentValidationError} on
 * the first problem found.
 */
export function validateIntent(intent: TraderIntent): void {
  assertAddress(intent.trader, "trader");
  assertAddress(intent.sellToken, "sellToken");
  assertAddress(intent.buyToken, "buyToken");

  if (intent.sellToken === intent.buyToken) {
    throw new IntentValidationError("sellToken and buyToken must differ");
  }
  if (intent.sellAmount <= 0n) {
    throw new IntentValidationError("sellAmount must be greater than zero");
  }
  if (intent.minBuyAmount <= 0n) {
    throw new IntentValidationError("minBuyAmount must be greater than zero");
  }
  assertBps(intent.maxSlippageBps, "maxSlippageBps");
  assertBps(intent.solverFeeBps, "solverFeeBps");

  if (!Number.isInteger(intent.deadline) || intent.deadline <= 0) {
    throw new IntentValidationError("deadline must be a positive unix timestamp in seconds");
  }
  if (intent.nonce < 0n) {
    throw new IntentValidationError("nonce must not be negative");
  }
}

/** Current unix time in seconds. */
export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Fluent builder for {@link TraderIntent}.
 *
 * ```ts
 * const intent = new IntentBuilder()
 *   .setTrader(trader)
 *   .setPair(xlm, usdc)
 *   .setAmounts("10000000", "9000000")
 *   .setSlippageBps(50)
 *   .setDeadline(600)
 *   .setNonce(1n)
 *   .build();
 * ```
 */
export class IntentBuilder {
  private trader?: string;
  private sellToken?: string;
  private buyToken?: string;
  private sellAmount?: bigint;
  private minBuyAmount?: bigint;
  private maxSlippageBps?: number;
  private deadline?: number;
  private nonce?: bigint;
  private solverFeeBps = 0;

  /** Sets the account selling `sellToken`. */
  setTrader(address: StellarAddress): this {
    this.trader = address;
    return this;
  }

  /** Sets the token pair. */
  setPair(sellToken: StellarAddress, buyToken: StellarAddress): this {
    this.sellToken = sellToken;
    this.buyToken = buyToken;
    return this;
  }

  /** Sets the exact sell amount and the gross minimum buy amount. */
  setAmounts(sellAmount: Amount, minBuyAmount: Amount): this {
    this.sellAmount = toBigInt(sellAmount, "sellAmount");
    this.minBuyAmount = toBigInt(minBuyAmount, "minBuyAmount");
    return this;
  }

  /** Sets the trader's slippage tolerance in basis points. */
  setSlippageBps(bps: number): this {
    this.maxSlippageBps = bps;
    return this;
  }

  /** Sets the fee, in basis points of the fill, retained by the solver. */
  setSolverFeeBps(bps: number): this {
    this.solverFeeBps = bps;
    return this;
  }

  /** Sets the replay nonce. Defaults to the current millisecond timestamp. */
  setNonce(nonce: Amount): this {
    this.nonce = toBigInt(nonce, "nonce");
    return this;
  }

  /** Sets the deadline relative to now, in seconds. */
  setDeadline(secondsFromNow: number, now: number = nowSeconds()): this {
    if (!Number.isInteger(secondsFromNow) || secondsFromNow <= 0) {
      throw new IntentValidationError("secondsFromNow must be a positive integer");
    }
    this.deadline = now + secondsFromNow;
    return this;
  }

  /** Sets an absolute unix-second deadline. */
  setDeadlineTimestamp(deadline: number): this {
    this.deadline = deadline;
    return this;
  }

  /** Builds and validates the intent. */
  build(now: number = nowSeconds()): TraderIntent {
    if (this.trader === undefined) throw new IntentValidationError("trader is required");
    if (this.sellToken === undefined) throw new IntentValidationError("sellToken is required");
    if (this.buyToken === undefined) throw new IntentValidationError("buyToken is required");
    if (this.sellAmount === undefined) throw new IntentValidationError("sellAmount is required");
    if (this.minBuyAmount === undefined) {
      throw new IntentValidationError("minBuyAmount is required");
    }
    if (this.maxSlippageBps === undefined) {
      throw new IntentValidationError("maxSlippageBps is required");
    }

    const intent: TraderIntent = {
      trader: this.trader,
      sellToken: this.sellToken,
      buyToken: this.buyToken,
      sellAmount: this.sellAmount,
      minBuyAmount: this.minBuyAmount,
      maxSlippageBps: this.maxSlippageBps,
      deadline: this.deadline ?? now + DEFAULT_INTENT_TTL_SECONDS,
      nonce: this.nonce ?? BigInt(Date.now()),
      solverFeeBps: this.solverFeeBps,
    };

    validateIntent(intent);

    if (intent.deadline <= now) {
      throw new IntentValidationError("deadline must be in the future");
    }
    return intent;
  }
}

function addressScVal(address: string): xdr.ScVal {
  return new Address(address).toScVal();
}

function i128ScVal(value: bigint): xdr.ScVal {
  return nativeToScVal(value, { type: "i128" });
}

function u64ScVal(value: bigint): xdr.ScVal {
  return nativeToScVal(value, { type: "u64" });
}

function u32ScVal(value: number): xdr.ScVal {
  return nativeToScVal(value, { type: "u32" });
}

function symbolScVal(value: string): xdr.ScVal {
  return xdr.ScVal.scvSymbol(value);
}

/**
 * Encodes an intent exactly as the router does: an `ScVal` map whose symbol
 * keys are sorted byte-wise. This is the canonical encoding used for hashing
 * and for the `TraderIntent` argument of `execute_intent`.
 */
export function intentToScVal(intent: TraderIntent): xdr.ScVal {
  const byField: Record<(typeof SCVAL_FIELD_ORDER)[number], xdr.ScVal> = {
    buy_token: addressScVal(intent.buyToken),
    deadline: u64ScVal(BigInt(intent.deadline)),
    max_slippage_bps: u32ScVal(intent.maxSlippageBps),
    min_buy_amount: i128ScVal(intent.minBuyAmount),
    nonce: u64ScVal(intent.nonce),
    sell_amount: i128ScVal(intent.sellAmount),
    sell_token: addressScVal(intent.sellToken),
    solver_fee_bps: u32ScVal(intent.solverFeeBps),
    trader: addressScVal(intent.trader),
  };

  const entries = SCVAL_FIELD_ORDER.map(
    (field) => new xdr.ScMapEntry({ key: symbolScVal(field), val: byField[field] }),
  );

  return xdr.ScVal.scvMap(entries);
}

/** Raw SHA-256 digest of the intent's canonical `ScVal` encoding. */
export function intentDigest(intent: TraderIntent): Buffer {
  return createHash("sha256").update(intentToScVal(intent).toXdr()).digest();
}

/**
 * Hex-encoded SHA-256 hash of an intent.
 *
 * This is byte-for-byte identical to `SlipGuardRouter::get_intent_hash` on
 * chain, so it can be used as a cache key or a lookup key without a round trip.
 */
export function hashIntent(intent: TraderIntent): string {
  return intentDigest(intent).toString("hex");
}

/** JSON representation of an intent, with integers encoded as strings. */
export function serializeIntent(intent: TraderIntent): string {
  return JSON.stringify(intent, (_key, value: unknown) =>
    typeof value === "bigint" ? value.toString() : value,
  );
}

/** Inverse of {@link serializeIntent}. */
export function deserializeIntent(json: string): TraderIntent {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new IntentValidationError("intent payload is not valid JSON");
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new IntentValidationError("intent payload must be a JSON object");
  }

  const raw = parsed as Record<string, unknown>;
  const intent: TraderIntent = {
    trader: String(raw.trader),
    sellToken: String(raw.sellToken),
    buyToken: String(raw.buyToken),
    sellAmount: toBigInt(raw.sellAmount as Amount, "sellAmount"),
    minBuyAmount: toBigInt(raw.minBuyAmount as Amount, "minBuyAmount"),
    maxSlippageBps: Number(raw.maxSlippageBps),
    deadline: Number(raw.deadline),
    nonce: toBigInt(raw.nonce as Amount, "nonce"),
    solverFeeBps: Number(raw.solverFeeBps),
  };

  validateIntent(intent);
  return intent;
}
