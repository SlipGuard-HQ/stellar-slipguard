import { nowSeconds } from "@slipguard/sdk";
import type { TraderIntent } from "@slipguard/sdk";

/** Basis-point denominator. */
export const BPS_DENOMINATOR = 10_000n;

/** Fixed-point scale used to convert floating point prices into integer math. */
const PRICE_SCALE = 1_000_000n;

/** Result of checking a proposed fill against the router's rules. */
export interface FillCheck {
  /** Whether the router would accept this fill. */
  ok: boolean;
  /** Human readable rejection reason when `ok` is false. */
  reason: string;
  /** Fee retained by the solver, in buy-token units. */
  solverFee: bigint;
  /** Amount the trader receives, in buy-token units. */
  traderProceeds: bigint;
  /** How far net proceeds fall below the trader's minimum, in basis points. */
  shortfallBps: bigint;
}

/** Inputs to {@link evaluateIntent}. */
export interface EvaluationInput {
  intent: TraderIntent;
  /** Amount of `buyToken` the solver intends to deliver. */
  fillAmount: bigint;
  /** Buy-token value the solver expects to realize from reselling `sellAmount`. */
  marketValueOfSell: bigint;
  /** Estimated total transaction cost, in buy-token units. */
  gasCost: bigint;
  /** Minimum acceptable net profit, in buy-token units. */
  minProfit: bigint;
  /** Override for the current unix time, mainly for tests. */
  now?: number;
}

/** Output of {@link evaluateIntent}. */
export interface EvaluationResult {
  profitable: boolean;
  reason: string;
  fillAmount: bigint;
  solverFee: bigint;
  traderProceeds: bigint;
  marketValueOfSell: bigint;
  gasCost: bigint;
  netProfit: bigint;
}

/** `amount * bps / 10_000`, floored. */
export function bpsOf(amount: bigint, bps: number): bigint {
  if (!Number.isInteger(bps) || bps < 0) {
    throw new RangeError("bps must be a non-negative integer");
  }
  return (amount * BigInt(bps)) / BPS_DENOMINATOR;
}

/**
 * Mirrors the router's `execute_intent` guard rails so the bot never submits a
 * fill that is guaranteed to revert.
 */
export function checkFillAgainstIntent(
  intent: TraderIntent,
  fillAmount: bigint,
  now: number = nowSeconds(),
): FillCheck {
  const base: FillCheck = {
    ok: false,
    reason: "",
    solverFee: 0n,
    traderProceeds: 0n,
    shortfallBps: 0n,
  };

  if (intent.sellAmount <= 0n || intent.minBuyAmount <= 0n) {
    return { ...base, reason: "intent amounts must be positive" };
  }
  if (intent.maxSlippageBps > 10_000 || intent.solverFeeBps > 10_000) {
    return { ...base, reason: "intent basis points out of range" };
  }
  if (fillAmount < 0n) {
    return { ...base, reason: "fill amount must not be negative" };
  }
  if (now > intent.deadline) {
    return { ...base, reason: "intent expired" };
  }
  if (fillAmount < intent.minBuyAmount) {
    return { ...base, reason: "fill below the trader's minimum buy amount" };
  }

  const solverFee = bpsOf(fillAmount, intent.solverFeeBps);
  const traderProceeds = fillAmount - solverFee;

  if (traderProceeds < intent.minBuyAmount) {
    const shortfall = intent.minBuyAmount - traderProceeds;
    const shortfallBps = (shortfall * BPS_DENOMINATOR) / intent.minBuyAmount;
    if (shortfallBps > BigInt(intent.maxSlippageBps)) {
      return {
        ok: false,
        reason: "trader slippage tolerance exceeded",
        solverFee,
        traderProceeds,
        shortfallBps,
      };
    }
    return { ok: true, reason: "fill accepted", solverFee, traderProceeds, shortfallBps };
  }

  return { ok: true, reason: "fill accepted", solverFee, traderProceeds, shortfallBps: 0n };
}

/**
 * Simulates a fill end to end.
 *
 * Profit is modelled from the solver's perspective: it pays `fillAmount` of
 * `buyToken`, receives `sellAmount` of `sellToken` worth `marketValueOfSell`,
 * and keeps `solverFee`.
 */
export function evaluateIntent(input: EvaluationInput): EvaluationResult {
  const now = input.now ?? nowSeconds();
  const check = checkFillAgainstIntent(input.intent, input.fillAmount, now);

  if (!check.ok) {
    return {
      profitable: false,
      reason: check.reason,
      fillAmount: input.fillAmount,
      solverFee: check.solverFee,
      traderProceeds: check.traderProceeds,
      marketValueOfSell: input.marketValueOfSell,
      gasCost: input.gasCost,
      netProfit: 0n,
    };
  }

  const netProfit = input.marketValueOfSell + check.solverFee - input.fillAmount - input.gasCost;
  const profitable = netProfit >= input.minProfit;

  return {
    profitable,
    reason: profitable ? "profitable" : "net profit below the configured minimum",
    fillAmount: input.fillAmount,
    solverFee: check.solverFee,
    traderProceeds: check.traderProceeds,
    marketValueOfSell: input.marketValueOfSell,
    gasCost: input.gasCost,
    netProfit,
  };
}

/**
 * Values `sellAmount` of one token in units of another using USD prices.
 *
 * Prices are scaled to a fixed-point integer before multiplying so the result
 * is deterministic and free of floating point drift.
 */
export function marketValueInQuote(
  sellAmount: bigint,
  sellPriceUsd: number,
  buyPriceUsd: number,
): bigint {
  if (!(sellPriceUsd > 0) || !(buyPriceUsd > 0)) {
    throw new RangeError("prices must be positive");
  }
  const sellScaled = BigInt(Math.round(sellPriceUsd * Number(PRICE_SCALE)));
  const buyScaled = BigInt(Math.round(buyPriceUsd * Number(PRICE_SCALE)));
  return (sellAmount * sellScaled) / buyScaled;
}

/** Evaluates an intent using a token price table. */
export function evaluateFromPrices(params: {
  intent: TraderIntent;
  fillAmount: bigint;
  prices: Record<string, number>;
  gasCost: bigint;
  minProfit: bigint;
  now?: number;
}): EvaluationResult {
  const sellPrice = params.prices[params.intent.sellToken];
  const buyPrice = params.prices[params.intent.buyToken];

  if (sellPrice === undefined || buyPrice === undefined) {
    return {
      profitable: false,
      reason: "missing price for sell or buy token",
      fillAmount: params.fillAmount,
      solverFee: 0n,
      traderProceeds: 0n,
      marketValueOfSell: 0n,
      gasCost: params.gasCost,
      netProfit: 0n,
    };
  }

  return evaluateIntent({
    intent: params.intent,
    fillAmount: params.fillAmount,
    marketValueOfSell: marketValueInQuote(params.intent.sellAmount, sellPrice, buyPrice),
    gasCost: params.gasCost,
    minProfit: params.minProfit,
    ...(params.now === undefined ? {} : { now: params.now }),
  });
}
