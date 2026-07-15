import { v7 as uuidv7 } from "uuid";

import {
  SettlementProtocolError,
  settlementPayloadHash,
  type SettlementEventInput,
  type SettlementEventRecord,
  type WaterfallPosition,
} from "../domain/settlement.js";
import type {
  CanonicalWaterfallEvent,
  CanonicalWaterfallLookupPort,
  SettlementContext,
  SettlementJournalPort,
  WaterfallRun,
  WaterfallSubmissionReceipt,
} from "../ports/settlement.js";

export class InMemorySettlementJournal implements SettlementJournalPort, CanonicalWaterfallLookupPort {
  readonly canonicalEvents = new Map<string, CanonicalWaterfallEvent>();
  readonly events = new Map<string, SettlementEventRecord>();
  readonly positions = new Map<string, WaterfallPosition>();
  readonly runs = new Map<string, WaterfallRun>();
  readonly #eventsByIdentity = new Map<string, string>();
  readonly #eventsByPayload = new Map<string, string>();
  readonly #runsByEvent = new Map<string, string>();

  constructor(private readonly options: { nextId?: () => string; now?: () => Date } = {}) {}

  async ingest(context: SettlementContext, input: SettlementEventInput): Promise<SettlementEventRecord> {
    const payloadHash = settlementPayloadHash(input);
    const identity = `${context.tenantId}:${input.source}:${input.externalEventId}`;
    const existingId = this.#eventsByIdentity.get(identity) ?? this.#eventsByPayload.get(`${context.tenantId}:${payloadHash}`);
    if (existingId !== undefined) {
      const existing = this.events.get(existingId)!;
      if (existing.payloadHash !== payloadHash) throw conflict();
      return { ...existing, replayed: true };
    }
    const event: SettlementEventRecord = {
      ...input,
      id: this.#id(),
      payloadHash,
      receivedAt: this.#now().toISOString(),
      replayed: false,
    };
    this.events.set(event.id, event);
    this.#eventsByIdentity.set(identity, event.id);
    this.#eventsByPayload.set(`${context.tenantId}:${payloadHash}`, event.id);
    return event;
  }

  async loadWaterfallPosition(input: { claimId: string; settlementEventId: string }) {
    const event = this.events.get(input.settlementEventId);
    const position = this.positions.get(input.claimId);
    if (event === undefined || position === undefined || event.claimId !== input.claimId) {
      throw new SettlementProtocolError("INVALID_SETTLEMENT", "Settlement event or projected position was not found.");
    }
    return { event, position };
  }

  async prepareWaterfall(input: Parameters<SettlementJournalPort["prepareWaterfall"]>[0]): Promise<WaterfallRun> {
    const existingId = this.#runsByEvent.get(input.allocation.settlementEventId);
    if (existingId !== undefined) {
      const existing = this.runs.get(existingId)!;
      if (existing.allocation.resultHash !== input.allocation.resultHash) throw conflict();
      return { ...existing, replayed: true };
    }
    const run: WaterfallRun = {
      allocation: input.allocation,
      claimId: input.position.claimId,
      claimKey: input.position.claimKey,
      id: this.#id(),
      replayed: false,
      status: "PREPARED",
    };
    this.runs.set(run.id, run);
    this.#runsByEvent.set(input.allocation.settlementEventId, run.id);
    return run;
  }

  async findByResultHash(input: { resultHash: string }): Promise<CanonicalWaterfallEvent | undefined> {
    return this.canonicalEvents.get(input.resultHash);
  }

  async markAmbiguous(input: { runId: string }): Promise<void> { this.#status(input.runId, "SUBMITTING_AMBIGUOUS"); }
  async markFailed(input: { runId: string }): Promise<void> { this.#status(input.runId, "FAILED_PROTOCOL"); }
  async markPrepared(input: { runId: string }): Promise<void> { this.#status(input.runId, "PREPARED"); }
  async markSubmitting(input: { runId: string }): Promise<void> { this.#status(input.runId, "SUBMITTING"); }

  async markSubmitted(input: {
    receipt: WaterfallSubmissionReceipt;
    run: WaterfallRun;
  }): Promise<WaterfallRun> {
    const updated: WaterfallRun = {
      ...input.run,
      replayed: input.run.replayed,
      status: "PENDING_RECONCILIATION",
      transactionHash: input.receipt.transactionHash,
    };
    this.runs.set(input.run.id, updated);
    return updated;
  }

  #id(): string { return this.options.nextId?.() ?? uuidv7(); }
  #now(): Date { return this.options.now?.() ?? new Date(); }
  #status(runId: string, status: WaterfallRun["status"]): void {
    const run = this.runs.get(runId);
    if (run === undefined) throw new Error("Waterfall run was not found.");
    this.runs.set(runId, { ...run, status });
  }
}

function conflict(): SettlementProtocolError {
  return new SettlementProtocolError("IDEMPOTENCY_CONFLICT", "Settlement identity was reused with different canonical content.");
}
