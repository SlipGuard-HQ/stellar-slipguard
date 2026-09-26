/**
 * `@slipguard/sdk`
 *
 * Build, validate, hash and submit SlipGuard conditional intents against a
 * deployed `SlipGuardRouter` on Stellar.
 *
 * ```ts
 * import { IntentBuilder, SlipGuardClient, NETWORKS } from "@slipguard/sdk";
 *
 * const intent = new IntentBuilder()
 *   .setTrader(trader)
 *   .setPair(xlm, usdc)
 *   .setAmounts(100_000_000n, 95_000_000n)
 *   .setSlippageBps(50)
 *   .setDeadline(600)
 *   .setNonce(1n)
 *   .build();
 *
 * const client = new SlipGuardClient({
 *   contractId: ROUTER_CONTRACT_ID,
 *   ...NETWORKS.testnet,
 *   publicKey: trader,
 * });
 *
 * const hash = await client.getIntentHash(intent); // equals client.hashIntent(intent)
 * ```
 */

export {
  BPS_DENOMINATOR,
  DEFAULT_INTENT_TTL_SECONDS,
  IntentBuilder,
  IntentValidationError,
  assertAddress,
  assertBps,
  deserializeIntent,
  hashIntent,
  intentDigest,
  intentToScVal,
  nowSeconds,
  serializeIntent,
  toBigInt,
  validateIntent,
} from "./intent.js";

export type { Amount } from "./intent.js";

export { SlipGuardClient } from "./client.js";

export { IntentStatus, NETWORKS } from "./types.js";

export type {
  FillReceipt,
  NetworkName,
  SlipGuardClientOptions,
  StellarAddress,
  SubmitResult,
  TraderIntent,
} from "./types.js";
