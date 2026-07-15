import { canonicalHash } from "../../../reliability/canonical-json.js";
import type { AnchorErrorClass } from "../domain/errors.js";
import type { AnchorPayoutReceipt } from "../domain/types.js";
import type {
  AnchorPayoutJournal,
  BeginPayoutDecision,
} from "../ports/payout-journal.js";

type JournalRecord = {
  operationId: string;
  receipt?: AnchorPayoutReceipt;
  requestHash: string;
  status: "PENDING" | "RETRYABLE_FAILURE" | "FAILED" | "SUCCEEDED";
  terminalFailure?: AnchorErrorClass;
};

export class InMemoryAnchorPayoutJournal implements AnchorPayoutJournal {
  readonly attempts: Record<string, unknown>[] = [];
  readonly audit: Record<string, unknown>[] = [];
  readonly outbox: Record<string, unknown>[] = [];
  readonly #records = new Map<string, JournalRecord>();
  readonly #nextId: () => string;
  #queue = Promise.resolve();

  constructor(options: { nextId?: () => string } = {}) {
    let sequence = 0;
    this.#nextId = options.nextId ?? (() => `01980a12-3456-789a-8abc-${String(++sequence).padStart(12, "0")}`);
  }

  begin(input: Parameters<AnchorPayoutJournal["begin"]>[0]): Promise<BeginPayoutDecision> {
    return this.#exclusive(async () => {
      const key = scopeKey(input.context);
      const existing = this.#records.get(key);
      if (existing === undefined) {
        const operationId = this.#nextId();
        this.#records.set(key, { operationId, requestHash: input.requestHash, status: "PENDING" });
        return { kind: "NEW", operationId };
      }
      if (existing.requestHash !== input.requestHash) return { kind: "CONFLICT" };
      if (existing.receipt !== undefined) {
        return { kind: "REPLAY", receipt: structuredClone(existing.receipt) };
      }
      if (existing.terminalFailure !== undefined) {
        return { kind: "FAILED", classification: existing.terminalFailure };
      }
      return { kind: "RESUME", operationId: existing.operationId };
    });
  }

  commitReceipt(input: Parameters<AnchorPayoutJournal["commitReceipt"]>[0]): Promise<AnchorPayoutReceipt> {
    return this.#exclusive(async () => {
      const key = scopeKey(input.context);
      const record = this.#records.get(key);
      if (record === undefined || record.operationId !== input.operationId) {
        throw new Error("Anchor payout operation was not initialized.");
      }
      if (record.receipt !== undefined) {
        if (record.receipt.receiptHash !== input.receipt.receiptHash) {
          throw new Error("Anchor payout receipt conflicts with the committed receipt.");
        }
        return structuredClone(record.receipt);
      }
      record.receipt = structuredClone(input.receipt);
      record.status = "SUCCEEDED";
      this.audit.push({
        action: "anchor.payout.completed",
        adapterMode: input.receipt.adapterMode,
        aggregateId: input.context.aggregateId,
        operationId: input.operationId,
        receiptHash: input.receipt.receiptHash,
        resolution: input.resolution,
        result: "SUCCESS",
        sandbox: true,
        tenantId: input.context.tenantId,
      });
      this.outbox.push({
        aggregateId: input.context.aggregateId,
        eventType: "anchor.payout.completed",
        idempotencyKey: input.context.idempotencyKey,
        payloadHash: canonicalHash({
          receiptHash: input.receipt.receiptHash,
          resolution: input.resolution,
        }),
        sandbox: true,
        tenantId: input.context.tenantId,
      });
      return structuredClone(input.receipt);
    });
  }

  async recordAttempt(input: Parameters<AnchorPayoutJournal["recordAttempt"]>[0]): Promise<void> {
    this.attempts.push({
      attempt: input.attempt,
      ...(input.classification === undefined ? {} : { classification: input.classification }),
      operationId: input.operationId,
      requestHash: input.requestHash,
      status: input.status,
      tenantId: input.context.tenantId,
    });
  }

  recordFailure(input: Parameters<AnchorPayoutJournal["recordFailure"]>[0]): Promise<void> {
    return this.#exclusive(async () => {
      const record = this.#records.get(scopeKey(input.context));
      if (record !== undefined) {
        record.status = input.retryable ? "RETRYABLE_FAILURE" : "FAILED";
        if (!input.retryable) record.terminalFailure = input.classification;
      }
      this.audit.push({
        action: "anchor.payout.failed",
        aggregateId: input.context.aggregateId,
        classification: input.classification,
        operationId: input.operationId,
        result: input.retryable ? "RETRYABLE_FAILURE" : "FAILED",
        sandbox: true,
        tenantId: input.context.tenantId,
      });
    });
  }

  #exclusive<T>(work: () => Promise<T>): Promise<T> {
    const result = this.#queue.then(work, work);
    this.#queue = result.then(() => undefined, () => undefined);
    return result;
  }
}

function scopeKey(context: {
  actorId: string;
  idempotencyKey: string;
  operationId: string;
  tenantId: string;
}): string {
  return `${context.tenantId}:${context.actorId}:${context.operationId}:${context.idempotencyKey}`;
}
