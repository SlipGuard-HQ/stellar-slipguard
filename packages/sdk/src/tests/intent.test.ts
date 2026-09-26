import { Keypair } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";

import {
  BPS_DENOMINATOR,
  IntentBuilder,
  IntentValidationError,
  assertBps,
  deserializeIntent,
  hashIntent,
  intentToScVal,
  serializeIntent,
  toBigInt,
  validateIntent,
} from "../intent.js";
import type { TraderIntent } from "../types.js";

// Deterministic keypairs so hashes are stable between runs.
const TRADER = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 1)).publicKey();
const SELL_TOKEN = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 2)).publicKey();
const BUY_TOKEN = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 3)).publicKey();

const NOW = 1_800_000_000;

function sampleIntent(overrides: Partial<TraderIntent> = {}): TraderIntent {
  return {
    trader: TRADER,
    sellToken: SELL_TOKEN,
    buyToken: BUY_TOKEN,
    sellAmount: 10_000_000n,
    minBuyAmount: 9_500_000n,
    maxSlippageBps: 50,
    deadline: NOW + 600,
    nonce: 1n,
    solverFeeBps: 0,
    ...overrides,
  };
}

describe("IntentBuilder", () => {
  it("builds a fully populated intent", () => {
    const intent = new IntentBuilder()
      .setTrader(TRADER)
      .setPair(SELL_TOKEN, BUY_TOKEN)
      .setAmounts(10_000_000n, 9_500_000n)
      .setSlippageBps(50)
      .setSolverFeeBps(10)
      .setDeadline(600, NOW)
      .setNonce(7n)
      .build(NOW);

    expect(intent).toEqual({
      trader: TRADER,
      sellToken: SELL_TOKEN,
      buyToken: BUY_TOKEN,
      sellAmount: 10_000_000n,
      minBuyAmount: 9_500_000n,
      maxSlippageBps: 50,
      deadline: NOW + 600,
      nonce: 7n,
      solverFeeBps: 10,
    });
  });

  it("defaults the solver fee to zero", () => {
    const intent = new IntentBuilder()
      .setTrader(TRADER)
      .setPair(SELL_TOKEN, BUY_TOKEN)
      .setAmounts(1n, 1n)
      .setSlippageBps(0)
      .setDeadline(600, NOW)
      .build(NOW);

    expect(intent.solverFeeBps).toBe(0);
  });

  it("rejects a missing required field", () => {
    expect(() =>
      new IntentBuilder()
        .setPair(SELL_TOKEN, BUY_TOKEN)
        .setAmounts(1n, 1n)
        .setSlippageBps(0)
        .build(NOW),
    ).toThrow(IntentValidationError);
  });

  it("rejects a deadline that is not in the future", () => {
    expect(() =>
      new IntentBuilder()
        .setTrader(TRADER)
        .setPair(SELL_TOKEN, BUY_TOKEN)
        .setAmounts(1n, 1n)
        .setSlippageBps(0)
        .setDeadlineTimestamp(NOW - 1)
        .build(NOW),
    ).toThrow(/deadline must be in the future/);
  });
});

describe("validation bounds", () => {
  it("rejects a malformed trader address", () => {
    expect(() => validateIntent(sampleIntent({ trader: "not-an-address" }))).toThrow(
      IntentValidationError,
    );
  });

  it("rejects slippage above 100%", () => {
    expect(() => validateIntent(sampleIntent({ maxSlippageBps: 10_001 }))).toThrow(
      /maxSlippageBps must be between 0 and 10000/,
    );
  });

  it("rejects non-integer basis points", () => {
    expect(() => assertBps(1.5, "maxSlippageBps")).toThrow(IntentValidationError);
  });

  it("rejects non-positive amounts", () => {
    expect(() => validateIntent(sampleIntent({ sellAmount: 0n }))).toThrow(/sellAmount/);
    expect(() => validateIntent(sampleIntent({ minBuyAmount: -1n }))).toThrow(/minBuyAmount/);
  });

  it("rejects an identical sell and buy token", () => {
    expect(() => validateIntent(sampleIntent({ buyToken: SELL_TOKEN }))).toThrow(/must differ/);
  });

  it("accepts the full basis-point range", () => {
    expect(() => validateIntent(sampleIntent({ maxSlippageBps: BPS_DENOMINATOR }))).not.toThrow();
    expect(() => validateIntent(sampleIntent({ maxSlippageBps: 0 }))).not.toThrow();
  });
});

describe("hashing", () => {
  it("is deterministic and 32 bytes wide", () => {
    const hash = hashIntent(sampleIntent());
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashIntent(sampleIntent())).toBe(hash);
  });

  it("matches the contract's reference hash vector", () => {
    // Shared with test_intent_hash_matches_sdk_reference_vector in
    // contracts/router/src/test.rs. If this ever changes, the Rust and
    // TypeScript encodings have diverged.
    expect(hashIntent(sampleIntent())).toBe(
      "5a1b7ff38e7cd7484e8336dfd9685dbfbc2203509cea6686486edbfb85860ee5",
    );
  });

  it("changes when any field changes", () => {
    const base = hashIntent(sampleIntent());
    expect(hashIntent(sampleIntent({ sellAmount: 10_000_001n }))).not.toBe(base);
    expect(hashIntent(sampleIntent({ minBuyAmount: 9_500_001n }))).not.toBe(base);
    expect(hashIntent(sampleIntent({ maxSlippageBps: 51 }))).not.toBe(base);
    expect(hashIntent(sampleIntent({ deadline: NOW + 601 }))).not.toBe(base);
    expect(hashIntent(sampleIntent({ nonce: 2n }))).not.toBe(base);
    expect(hashIntent(sampleIntent({ solverFeeBps: 1 }))).not.toBe(base);
    expect(hashIntent(sampleIntent({ buyToken: TRADER }))).not.toBe(base);
  });

  it("encodes the intent as a map with byte-wise sorted symbol keys", () => {
    const scVal = intentToScVal(sampleIntent());
    expect(scVal.type).toBe("scvMap");

    const entries = scVal.type === "scvMap" ? (scVal.map ?? []) : [];
    const keys = entries.map((entry) =>
      entry.key.type === "scvSymbol" ? entry.key.sym.toString() : entry.key.type,
    );

    expect(keys).toEqual([...keys].sort());
    expect(keys).toEqual([
      "buy_token",
      "deadline",
      "max_slippage_bps",
      "min_buy_amount",
      "nonce",
      "sell_amount",
      "sell_token",
      "solver_fee_bps",
      "trader",
    ]);
  });
});

describe("serialization", () => {
  it("round-trips an intent through JSON", () => {
    const intent = sampleIntent();
    const restored = deserializeIntent(serializeIntent(intent));

    expect(restored).toEqual(intent);
    expect(hashIntent(restored)).toBe(hashIntent(intent));
  });

  it("encodes bigint fields as strings", () => {
    const encoded = JSON.parse(serializeIntent(sampleIntent())) as Record<string, unknown>;
    expect(encoded.sellAmount).toBe("10000000");
    expect(encoded.minBuyAmount).toBe("9500000");
    expect(encoded.nonce).toBe("1");
  });

  it("rejects malformed payloads", () => {
    expect(() => deserializeIntent("{")).toThrow(IntentValidationError);
    expect(() => deserializeIntent("null")).toThrow(IntentValidationError);
    expect(() => deserializeIntent('{"trader":"x"}')).toThrow(IntentValidationError);
  });
});

describe("toBigInt", () => {
  it("accepts bigint, safe integer and numeric string inputs", () => {
    expect(toBigInt(7n, "x")).toBe(7n);
    expect(toBigInt(7, "x")).toBe(7n);
    expect(toBigInt("7", "x")).toBe(7n);
  });

  it("rejects fractional and non-numeric inputs", () => {
    expect(() => toBigInt(1.2, "x")).toThrow(IntentValidationError);
    expect(() => toBigInt("1.2", "x")).toThrow(IntentValidationError);
  });
});
