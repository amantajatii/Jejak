import { canonicalHash } from "../../../reliability/canonical-json.js";
import type { IssuerErrorClass } from "../domain/errors.js";
import type { IssuerApprovalReceipt } from "../domain/types.js";
import type {
  BeginIssuerDecision,
  IssuerOperationJournal,
} from "../ports/issuer-journal.js";

type JournalRecord = {
  operationRecordId: string;
  receipt?: IssuerApprovalReceipt;
  requestHash: string;
  status: "PENDING" | "RETRYABLE_FAILURE" | "FAILED" | "DECIDED";
  terminalFailure?: IssuerErrorClass;
};

export class InMemoryIssuerOperationJournal implements IssuerOperationJournal {
  readonly attempts: Record<string, unknown>[] = [];
  readonly audit: Record<string, unknown>[] = [];
  readonly outbox: Record<string, unknown>[] = [];
  readonly #failureEvents = new Set<string>();
  readonly #nextId: () => string;
  readonly #records = new Map<string, JournalRecord>();
  #queue = Promise.resolve();

  constructor(options: { nextId?: () => string } = {}) {
    let sequence = 0;
    this.#nextId = options.nextId ?? (() => `01980a12-3456-789a-8abc-${String(++sequence).padStart(12, "0")}`);
  }

  begin(input: Parameters<IssuerOperationJournal["begin"]>[0]): Promise<BeginIssuerDecision> {
    return this.#exclusive(async () => {
      const key = scopeKey(input.context);
      const existing = this.#records.get(key);
      if (existing === undefined) {
        const operationRecordId = this.#nextId();
        this.#records.set(key, {
          operationRecordId,
          requestHash: input.requestHash,
          status: "PENDING",
        });
        return { kind: "NEW", operationRecordId };
      }
      if (existing.requestHash !== input.requestHash) return { kind: "CONFLICT" };
      if (existing.receipt !== undefined) return { kind: "REPLAY", receipt: structuredClone(existing.receipt) };
      if (existing.terminalFailure !== undefined) {
        return { kind: "FAILED", classification: existing.terminalFailure };
      }
      return { kind: "RESUME", operationRecordId: existing.operationRecordId };
    });
  }

  commitReceipt(input: Parameters<IssuerOperationJournal["commitReceipt"]>[0]): Promise<IssuerApprovalReceipt> {
    return this.#exclusive(async () => {
      const record = this.#records.get(scopeKey(input.context));
      if (record === undefined || record.operationRecordId !== input.operationRecordId) {
        throw new Error("Issuer operation was not initialized.");
      }
      if (record.receipt !== undefined) {
        if (record.receipt.receiptHash !== input.receipt.receiptHash) {
          throw new Error("Issuer receipt conflicts with the committed receipt.");
        }
        return structuredClone(record.receipt);
      }
      record.receipt = structuredClone(input.receipt);
      record.status = "DECIDED";
      this.audit.push({
        action: "issuer.approval.decided",
        adapterMode: input.receipt.adapterMode,
        aggregateId: input.context.aggregateId,
        approved: input.receipt.approved,
        correlationId: input.context.correlationId,
        operationRecordId: input.operationRecordId,
        receiptHash: input.receipt.receiptHash,
        resolution: input.resolution,
        result: input.receipt.status,
        sandbox: true,
        tenantId: input.context.tenantId,
      });
      this.outbox.push({
        aggregateId: input.context.aggregateId,
        eventType: "issuer.approval.decided",
        idempotencyKey: input.context.idempotencyKey,
        payloadHash: canonicalHash({
          approved: input.receipt.approved,
          receiptHash: input.receipt.receiptHash,
          resolution: input.resolution,
          status: input.receipt.status,
        }),
        sandbox: true,
        tenantId: input.context.tenantId,
      });
      return structuredClone(input.receipt);
    });
  }

  async recordAttempt(input: Parameters<IssuerOperationJournal["recordAttempt"]>[0]): Promise<void> {
    this.attempts.push({
      attempt: input.attempt,
      ...(input.classification === undefined ? {} : { classification: input.classification }),
      operationRecordId: input.operationRecordId,
      requestHash: input.requestHash,
      status: input.status,
      tenantId: input.context.tenantId,
    });
  }

  recordFailure(input: Parameters<IssuerOperationJournal["recordFailure"]>[0]): Promise<void> {
    return this.#exclusive(async () => {
      const record = this.#records.get(scopeKey(input.context));
      if (record !== undefined) {
        record.status = input.retryable ? "RETRYABLE_FAILURE" : "FAILED";
        if (!input.retryable) record.terminalFailure = input.classification;
      }
      this.audit.push({
        action: "issuer.approval.failed",
        aggregateId: input.context.aggregateId,
        classification: input.classification,
        correlationId: input.context.correlationId,
        operationRecordId: input.operationRecordId,
        result: input.retryable ? "RETRYABLE_FAILURE" : "FAILED",
        sandbox: true,
        tenantId: input.context.tenantId,
      });
      const eventKey = `${input.operationRecordId}:${input.classification}:${input.retryable}`;
      if (!this.#failureEvents.has(eventKey)) {
        this.#failureEvents.add(eventKey);
        this.outbox.push({
          aggregateId: input.context.aggregateId,
          eventType: "partner.adapter.failed",
          idempotencyKey: input.context.idempotencyKey,
          payloadHash: canonicalHash({
            classification: input.classification,
            operation: "ISSUER_APPROVAL",
            retryable: input.retryable,
          }),
          sandbox: true,
          tenantId: input.context.tenantId,
        });
      }
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
