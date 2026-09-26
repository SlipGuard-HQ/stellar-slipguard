import {
  Contract,
  BASE_FEE,
  Keypair,
  Transaction,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  xdr,
  Address,
} from "@stellar/stellar-sdk";

import type { Account } from "@stellar/stellar-sdk";

import { hashIntent, intentToScVal } from "./intent.js";
import { IntentStatus } from "./types.js";
import type { SlipGuardClientOptions, SubmitResult, TraderIntent } from "./types.js";

const DEFAULT_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 1_000;

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Thin, typed wrapper around the deployed `SlipGuardRouter`.
 *
 * Read calls go through Soroban RPC simulation; write calls are prepared,
 * signed by the caller's `Keypair` and polled to ledger inclusion.
 */
export class SlipGuardClient {
  /** Deployed router contract id. */
  readonly contractId: string;
  /** Passphrase the built transactions target. */
  readonly networkPassphrase: string;

  private readonly server: rpc.Server;
  private readonly contract: Contract;
  private readonly publicKey?: string;

  constructor(options: SlipGuardClientOptions) {
    this.contractId = options.contractId;
    this.networkPassphrase = options.networkPassphrase;
    this.publicKey = options.publicKey;
    this.server = new rpc.Server(options.rpcUrl, {
      allowHttp: options.allowHttp ?? false,
    });
    this.contract = new Contract(options.contractId);
  }

  /** Local (off-chain) hash, identical to `get_intent_hash` on chain. */
  hashIntent(intent: TraderIntent): string {
    return hashIntent(intent);
  }

  /** Builds the `execute_intent` operation for a solver key. */
  buildExecuteIntentOperation(
    solver: string,
    intent: TraderIntent,
    actualBuyAmount: bigint,
  ): xdr.Operation {
    return this.contract.call(
      "execute_intent",
      new Address(solver).toScVal(),
      intentToScVal(intent),
      nativeToScVal(actualBuyAmount, { type: "i128" }),
    );
  }

  /** Builds the `cancel_intent` operation for the intent's trader. */
  buildCancelIntentOperation(intent: TraderIntent): xdr.Operation {
    return this.contract.call("cancel_intent", intentToScVal(intent));
  }

  /** Builds the `get_intent_hash` operation. */
  buildGetIntentHashOperation(intent: TraderIntent): xdr.Operation {
    return this.contract.call("get_intent_hash", intentToScVal(intent));
  }

  /** Builds the `get_intent_status` operation from a hex intent hash. */
  buildGetIntentStatusOperation(intentHash: string): xdr.Operation {
    return this.contract.call("get_intent_status", bytesNScVal(intentHash, "intentHash"));
  }

  /**
   * Simulates a read-only call and returns the raw return value.
   *
   * Read simulations need a funded source account; pass `publicKey` here to
   * override the client default.
   */
  async simulateRead(operation: xdr.Operation, publicKey?: string): Promise<xdr.ScVal> {
    const source = await this.sourceAccount(publicKey);
    const transaction = this.buildTransaction(source, operation);
    const simulation = await this.server.simulateTransaction(transaction);

    if (rpc.Api.isSimulationError(simulation)) {
      throw new Error(`simulation failed: ${simulation.error}`);
    }

    const retval = (simulation as rpc.Api.SimulateTransactionSuccessResponse).result?.retval;
    if (!retval) {
      throw new Error("simulation returned no value");
    }
    return retval;
  }

  /** Reads the on-chain hash of an intent. */
  async getIntentHash(intent: TraderIntent, publicKey?: string): Promise<string> {
    const retval = await this.simulateRead(this.buildGetIntentHashOperation(intent), publicKey);
    if (retval.type !== "scvBytes") {
      throw new Error(`get_intent_hash returned ${retval.type}, expected scvBytes`);
    }
    return Buffer.from(retval.bytes.value).toString("hex");
  }

  /** Reads the lifecycle status of an intent. */
  async getIntentStatus(intent: TraderIntent, publicKey?: string): Promise<IntentStatus> {
    const retval = await this.simulateRead(
      this.buildGetIntentStatusOperation(hashIntent(intent)),
      publicKey,
    );
    if (retval.type !== "scvU32") {
      throw new Error(`get_intent_status returned ${retval.type}, expected scvU32`);
    }
    return retval.u32 as IntentStatus;
  }

  /**
   * Builds, simulates, assembles and signs an `execute_intent` transaction.
   *
   * Pass `authEntries` to attach authorization entries the trader signed
   * off-chain. Without them the entries produced by simulation are used, which
   * only works when the trader is available to sign at fill time.
   */
  async prepareExecuteIntent(params: {
    solver: Keypair;
    intent: TraderIntent;
    actualBuyAmount: bigint;
    fee?: string;
    authEntries?: xdr.SorobanAuthorizationEntry[];
  }): Promise<Transaction> {
    const source = await this.server.getAccount(params.solver.publicKey());
    const operation = this.buildExecuteIntentOperation(
      params.solver.publicKey(),
      params.intent,
      params.actualBuyAmount,
    );
    const transaction = this.buildTransaction(source, operation, params.fee ?? BASE_FEE);
    const simulation = await this.server.simulateTransaction(transaction);

    if (rpc.Api.isSimulationError(simulation)) {
      throw new Error(`execute_intent simulation failed: ${simulation.error}`);
    }

    const prepared = rpc
      .assembleTransaction(transaction, withAuth(params.authEntries, simulation))
      .build();
    prepared.sign(params.solver);
    return prepared;
  }

  /** Submits a signed transaction and waits for ledger inclusion. */
  async submitTransaction(
    transaction: Transaction,
    timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ): Promise<SubmitResult> {
    const sent = await this.server.sendTransaction(transaction);
    if (sent.status === "ERROR") {
      throw new Error(`transaction rejected: ${JSON.stringify(sent.errorResult ?? sent)}`);
    }
    return this.poll(sent.hash, timeoutMs);
  }

  /** Polls a submitted transaction hash until it settles or times out. */
  async poll(hash: string, timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<SubmitResult> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const response = await this.server.getTransaction(hash);
      if (response.status === "SUCCESS") {
        return { hash, status: "SUCCESS", ledger: response.ledger };
      }
      if (response.status === "FAILED") {
        return { hash, status: "FAILED", ledger: response.ledger };
      }
      await delay(POLL_INTERVAL_MS);
    }
    return { hash, status: "NOT_FOUND" };
  }

  private async sourceAccount(publicKey?: string): Promise<Account> {
    const key = publicKey ?? this.publicKey;
    if (!key) {
      throw new Error("a publicKey is required to build or simulate a transaction");
    }
    return this.server.getAccount(key);
  }

  private buildTransaction(
    source: Account,
    operation: xdr.Operation,
    fee: string = BASE_FEE,
  ): Transaction {
    return new TransactionBuilder(source, {
      fee,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(operation)
      .setTimeout(60)
      .build();
  }
}

/**
 * Overrides the simulated authorization entries with caller-supplied ones.
 *
 * `preparedTransaction` cannot be used here because it discards any auth the
 * trader signed off-chain and instead expects the ledger simulation to produce
 * satisfiable entries.
 */
function withAuth(
  authEntries: xdr.SorobanAuthorizationEntry[] | undefined,
  simulation: rpc.Api.SimulateTransactionResponse,
): rpc.Api.SimulateTransactionResponse {
  if (authEntries === undefined || authEntries.length === 0) {
    return simulation;
  }
  const success = simulation as rpc.Api.SimulateTransactionSuccessResponse;
  if (success.result === undefined) {
    return simulation;
  }
  return {
    ...success,
    result: { ...success.result, auth: authEntries },
  };
}

function bytesNScVal(hex: string, field: string): xdr.ScVal {
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error(`${field} must be a 32-byte hex string`);
  }
  return xdr.ScVal.scvBytes(Buffer.from(hex, "hex"));
}
