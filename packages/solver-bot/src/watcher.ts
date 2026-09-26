import { deserializeIntent, hashIntent } from "@slipguard/sdk";
import type { TraderIntent } from "@slipguard/sdk";
import { rpc, xdr } from "@stellar/stellar-sdk";

import type { SolverConfig } from "./config.js";
import type { Logger } from "./logger.js";

/** An intent the bot may be able to fill. */
export interface CandidateIntent {
  /** Hex SHA-256 hash, identical to `get_intent_hash` on chain. */
  hash: string;
  /** Where the intent was discovered. */
  source: "feed" | "chain";
  /** The decoded intent. */
  intent: TraderIntent;
  /** Optional base64 `SorobanAuthorizationEntry` supplied by the trader. */
  traderAuthEntry?: string;
}

/** A concise view of a router event, used for observability. */
export interface RouterEventSummary {
  ledger: number;
  name: string;
  txHash: string;
}

/**
 * Watches two sources for fillable intents:
 *
 * 1. An optional HTTP feed (`INTENT_FEED_URL`) publishing signed intents.
 * 2. On-chain router events, which report fills and cancellations.
 *
 * Intents already returned by a previous poll are never returned twice.
 */
export class IntentWatcher {
  private readonly server: rpc.Server;
  private readonly seen = new Set<string>();
  private cursor: number;

  constructor(
    private readonly config: SolverConfig,
    private readonly logger: Logger,
  ) {
    this.server = new rpc.Server(config.rpcUrl, { allowHttp: config.allowHttp });
    this.cursor = config.startLedger ?? 0;
  }

  /** Runs one poll cycle and returns newly discovered intents. */
  async poll(): Promise<CandidateIntent[]> {
    const events = await this.pollEvents();
    for (const event of events) {
      this.logger.info("router event observed", {
        ledger: event.ledger,
        name: event.name,
        txHash: event.txHash,
      });
    }

    const discovered = await this.pollFeed();
    const fresh: CandidateIntent[] = [];
    for (const candidate of discovered) {
      if (this.seen.has(candidate.hash)) {
        continue;
      }
      this.seen.add(candidate.hash);
      fresh.push(candidate);
    }
    return fresh;
  }

  private async pollFeed(): Promise<CandidateIntent[]> {
    const url = this.config.intentFeedUrl;
    if (url === undefined) {
      return [];
    }

    try {
      const response = await fetch(url);
      if (!response.ok) {
        this.logger.warn("intent feed returned an error", { url, status: response.status });
        return [];
      }
      return this.parseFeed((await response.json()) as unknown);
    } catch (error) {
      this.logger.warn("intent feed unreachable", { url, error: String(error) });
      return [];
    }
  }

  private parseFeed(payload: unknown): CandidateIntent[] {
    const entries = extractEntries(payload);
    const candidates: CandidateIntent[] = [];

    for (const entry of entries) {
      try {
        const record = entry as Record<string, unknown>;
        const rawIntent = record.intent ?? record;
        const json = typeof rawIntent === "string" ? rawIntent : JSON.stringify(rawIntent);
        const intent = deserializeIntent(json);
        const traderAuthEntry =
          typeof record.traderAuthEntry === "string" ? record.traderAuthEntry : undefined;
        const candidate: CandidateIntent = {
          hash: hashIntent(intent),
          source: "feed",
          intent,
        };
        if (traderAuthEntry !== undefined) {
          candidate.traderAuthEntry = traderAuthEntry;
        }
        candidates.push(candidate);
      } catch (error) {
        this.logger.warn("skipping malformed feed entry", { error: String(error) });
      }
    }

    return candidates;
  }

  private async pollEvents(): Promise<RouterEventSummary[]> {
    if (this.cursor === 0) {
      const latest = await this.server.getLatestLedger();
      this.cursor = Math.max(1, latest.sequence);
    }

    const response = await this.server.getEvents({
      startLedger: this.cursor,
      filters: [{ type: "contract", contractIds: [this.config.routerContractId] }],
      limit: 100,
    });

    const summaries = response.events.map((event) => ({
      ledger: event.ledger,
      name: decodeEventName(event.topic),
      txHash: event.txHash,
    }));

    if (response.latestLedger > 0 && response.events.length > 0) {
      this.cursor = response.latestLedger + 1;
    }
    return summaries;
  }
}

function extractEntries(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (typeof payload === "object" && payload !== null) {
    const intents = (payload as { intents?: unknown }).intents;
    if (Array.isArray(intents)) {
      return intents;
    }
  }
  return [];
}

function decodeEventName(topics: xdr.ScVal[]): string {
  const first = topics[0];
  if (first === undefined) {
    return "unknown";
  }
  return first.type === "scvSymbol" ? first.sym.toString() : first.type;
}
