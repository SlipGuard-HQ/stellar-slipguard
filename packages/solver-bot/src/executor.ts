import { SlipGuardClient } from "@slipguard/sdk";
import type { SubmitResult } from "@slipguard/sdk";
import { Keypair, xdr } from "@stellar/stellar-sdk";

import type { SolverConfig } from "./config.js";
import type { Logger } from "./logger.js";
import type { CandidateIntent } from "./watcher.js";

/**
 * Signs and submits fills for profitable intents.
 *
 * The transaction is prepared (simulated and assembled) through
 * {@link SlipGuardClient}, signed with the solver's key, and polled until the
 * network reports success, failure or timeout.
 */
export class IntentExecutor {
  private readonly keypair: Keypair;
  private readonly client: SlipGuardClient;

  constructor(
    private readonly config: SolverConfig,
    private readonly logger: Logger,
    client?: SlipGuardClient,
  ) {
    this.keypair = Keypair.fromSecret(config.solverSecretKey);
    this.client =
      client ??
      new SlipGuardClient({
        contractId: config.routerContractId,
        rpcUrl: config.rpcUrl,
        networkPassphrase: config.networkPassphrase,
        publicKey: this.keypair.publicKey(),
        allowHttp: config.allowHttp,
      });
  }

  /** The solver's public key, derived from `SOLVER_SECRET_KEY`. */
  solverAddress(): string {
    return this.keypair.publicKey();
  }

  /**
   * Executes a fill. Returns `undefined` when running in dry-run mode.
   *
   * A `traderAuthEntry` attached to the candidate is added to the transaction
   * so the trader's pre-signed authorization travels with the fill.
   */
  async execute(candidate: CandidateIntent, fillAmount: bigint): Promise<SubmitResult | undefined> {
    if (this.config.dryRun) {
      this.logger.info("dry run: fill not submitted", {
        hash: candidate.hash,
        fillAmount: fillAmount.toString(),
      });
      return undefined;
    }

    const authEntries = decodeAuthEntries(candidate.traderAuthEntry);
    const transaction = await this.client.prepareExecuteIntent({
      solver: this.keypair,
      intent: candidate.intent,
      actualBuyAmount: fillAmount,
      fee: this.config.maxFeeStroops,
      ...(authEntries.length > 0 ? { authEntries } : {}),
    });

    this.logger.info("submitting fill", { hash: candidate.hash });
    const result = await this.client.submitTransaction(transaction, this.config.txTimeoutMs);
    this.logger.info("fill settled", {
      hash: candidate.hash,
      status: result.status,
      ledger: result.ledger,
    });
    return result;
  }
}

function decodeAuthEntries(encoded: string | undefined): xdr.SorobanAuthorizationEntry[] {
  if (encoded === undefined) {
    return [];
  }
  return [xdr.SorobanAuthorizationEntry.fromXdr(encoded, "base64")];
}
