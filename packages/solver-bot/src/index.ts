#!/usr/bin/env node

import { loadConfig } from "./config.js";
import { evaluateFromPrices } from "./evaluator.js";
import { IntentExecutor } from "./executor.js";
import { createLogger } from "./logger.js";
import { IntentWatcher } from "./watcher.js";
import type { CandidateIntent } from "./watcher.js";

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel, { service: "slipguard-solver" });

  const watcher = new IntentWatcher(config, logger);
  const executor = new IntentExecutor(config, logger);

  logger.info("solver starting", {
    rpcUrl: config.rpcUrl,
    routerContractId: config.routerContractId,
    solver: executor.solverAddress(),
    feed: config.intentFeedUrl ?? null,
    pollIntervalMs: config.pollIntervalMs,
    dryRun: config.dryRun,
  });

  let running = true;

  const stop = (signal: string): void => {
    if (!running) {
      return;
    }
    running = false;
    logger.info("shutdown signal received", { signal });
  };

  process.on("SIGINT", () => stop("SIGINT"));
  process.on("SIGTERM", () => stop("SIGTERM"));

  async function handle(candidate: CandidateIntent): Promise<void> {
    const evaluation = evaluateFromPrices({
      intent: candidate.intent,
      fillAmount: candidate.intent.minBuyAmount,
      prices: config.tokenPrices,
      gasCost: config.gasCost,
      minProfit: config.minProfit,
    });

    logger.info("evaluated intent", {
      hash: candidate.hash,
      source: candidate.source,
      profitable: evaluation.profitable,
      reason: evaluation.reason,
      netProfit: evaluation.netProfit.toString(),
      fillAmount: evaluation.fillAmount.toString(),
    });

    if (!evaluation.profitable) {
      return;
    }
    await executor.execute(candidate, evaluation.fillAmount);
  }

  async function tick(): Promise<void> {
    const candidates = await watcher.poll();
    if (candidates.length === 0) {
      logger.debug("no fresh intents");
      return;
    }
    for (const candidate of candidates) {
      if (!running) {
        return;
      }
      await handle(candidate);
    }
  }

  while (running) {
    try {
      await tick();
    } catch (error) {
      logger.error("poll cycle failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    if (!running) {
      break;
    }
    await sleep(config.pollIntervalMs);
  }

  logger.info("solver stopped");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
