import type { TraderIntent } from "@slipguard/sdk";
import { describe, expect, it } from "vitest";

import {
  bpsOf,
  checkFillAgainstIntent,
  evaluateFromPrices,
  evaluateIntent,
  marketValueInQuote,
} from "../evaluator.js";

const NOW = 1_800_000_000;

const SELL_TOKEN = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4";
const BUY_TOKEN = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC5";
const TRADER = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF5";

function makeIntent(overrides: Partial<TraderIntent> = {}): TraderIntent {
  return {
    trader: TRADER,
    sellToken: SELL_TOKEN,
    buyToken: BUY_TOKEN,
    sellAmount: 1_000_000n,
    minBuyAmount: 1_000_000n,
    maxSlippageBps: 100,
    deadline: NOW + 600,
    nonce: 1n,
    solverFeeBps: 50,
    ...overrides,
  };
}

describe("bpsOf", () => {
  it("applies basis points and floors the result", () => {
    expect(bpsOf(1_000_000n, 50)).toBe(5_000n);
    expect(bpsOf(1_000_000n, 0)).toBe(0n);
    expect(bpsOf(1n, 50)).toBe(0n);
  });

  it("rejects invalid basis points", () => {
    expect(() => bpsOf(1n, -1)).toThrow(RangeError);
    expect(() => bpsOf(1n, 1.5)).toThrow(RangeError);
  });
});

describe("checkFillAgainstIntent", () => {
  it("accepts a fill that satisfies every rule", () => {
    const check = checkFillAgainstIntent(makeIntent(), 1_000_000n, NOW);
    expect(check.ok).toBe(true);
    expect(check.solverFee).toBe(5_000n);
    expect(check.traderProceeds).toBe(995_000n);
    expect(check.shortfallBps).toBe(50n);
  });

  it("rejects an expired intent", () => {
    const check = checkFillAgainstIntent(makeIntent(), 1_000_000n, NOW + 601);
    expect(check.ok).toBe(false);
    expect(check.reason).toMatch(/expired/);
  });

  it("rejects a fill below the trader minimum", () => {
    const check = checkFillAgainstIntent(makeIntent(), 999_999n, NOW);
    expect(check.ok).toBe(false);
    expect(check.reason).toMatch(/minimum/);
  });

  it("rejects a fee that breaches the slippage tolerance", () => {
    const check = checkFillAgainstIntent(makeIntent({ solverFeeBps: 500 }), 1_000_000n, NOW);
    expect(check.ok).toBe(false);
    expect(check.reason).toMatch(/slippage/);
    expect(check.shortfallBps).toBe(500n);
  });

  it("rejects malformed intent parameters", () => {
    expect(checkFillAgainstIntent(makeIntent({ sellAmount: 0n }), 1_000_000n, NOW).ok).toBe(false);
    expect(checkFillAgainstIntent(makeIntent({ maxSlippageBps: 10_001 }), 1_000_000n, NOW).ok).toBe(
      false,
    );
  });
});

describe("evaluateIntent", () => {
  it("marks a profitable fill", () => {
    const result = evaluateIntent({
      intent: makeIntent(),
      fillAmount: 1_000_000n,
      marketValueOfSell: 1_200_000n,
      gasCost: 20_000n,
      minProfit: 0n,
      now: NOW,
    });

    expect(result.profitable).toBe(true);
    expect(result.netProfit).toBe(185_000n);
  });

  it("rejects a fill that would lose money", () => {
    const result = evaluateIntent({
      intent: makeIntent(),
      fillAmount: 1_000_000n,
      marketValueOfSell: 900_000n,
      gasCost: 20_000n,
      minProfit: 0n,
      now: NOW,
    });

    expect(result.profitable).toBe(false);
    expect(result.netProfit).toBe(-115_000n);
  });

  it("respects the configured minimum profit", () => {
    const result = evaluateIntent({
      intent: makeIntent(),
      fillAmount: 1_000_000n,
      marketValueOfSell: 1_200_000n,
      gasCost: 20_000n,
      minProfit: 200_000n,
      now: NOW,
    });

    expect(result.profitable).toBe(false);
    expect(result.reason).toMatch(/minimum/);
  });

  it("never reports profit when the router would revert", () => {
    const result = evaluateIntent({
      intent: makeIntent({ solverFeeBps: 500 }),
      fillAmount: 1_000_000n,
      marketValueOfSell: 10_000_000n,
      gasCost: 0n,
      minProfit: 0n,
      now: NOW,
    });

    expect(result.profitable).toBe(false);
    expect(result.netProfit).toBe(0n);
  });
});

describe("marketValueInQuote", () => {
  it("converts between token units using prices", () => {
    expect(marketValueInQuote(1_000_000n, 1, 2)).toBe(500_000n);
    expect(marketValueInQuote(1_000_000n, 2, 1)).toBe(2_000_000n);
  });

  it("rejects non-positive prices", () => {
    expect(() => marketValueInQuote(1n, 0, 1)).toThrow(RangeError);
  });
});

describe("evaluateFromPrices", () => {
  it("values the fill from a price table", () => {
    const result = evaluateFromPrices({
      intent: makeIntent(),
      fillAmount: 1_000_000n,
      prices: { [SELL_TOKEN]: 2, [BUY_TOKEN]: 1 },
      gasCost: 10_000n,
      minProfit: 0n,
      now: NOW,
    });

    // 1_000_000 sell units at $2 equals 2_000_000 buy units at $1.
    expect(result.marketValueOfSell).toBe(2_000_000n);
    expect(result.netProfit).toBe(995_000n);
    expect(result.profitable).toBe(true);
  });

  it("refuses to trade a pair with no price", () => {
    const result = evaluateFromPrices({
      intent: makeIntent(),
      fillAmount: 1_000_000n,
      prices: { [SELL_TOKEN]: 1 },
      gasCost: 0n,
      minProfit: 0n,
      now: NOW,
    });

    expect(result.profitable).toBe(false);
    expect(result.reason).toMatch(/missing price/);
  });
});
