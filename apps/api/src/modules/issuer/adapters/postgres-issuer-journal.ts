import type { JejakDatabase } from "../../../db/client.js";
import { PostgresPartnerJournal } from "../../shared/postgres-partner-journal.js";
import type { IssuerErrorClass } from "../domain/errors.js";
import type { IssuerApprovalReceipt, IssuerOperationContext } from "../domain/types.js";
import type { IssuerOperationJournal } from "../ports/issuer-journal.js";

export class PostgresIssuerOperationJournal implements IssuerOperationJournal {
  readonly #journal: PostgresPartnerJournal<IssuerApprovalReceipt, IssuerErrorClass>;
  constructor(database: JejakDatabase, options: { nextId?: () => string; now?: () => Date } = {}) {
    this.#journal = new PostgresPartnerJournal(database, {
      eventPrefix: "issuer.approval", kind: "ISSUER_APPROVAL", partner: "ISSUER_SANDBOX", resourceType: "ISSUER_APPROVAL",
      resourceId: (context) => (context as IssuerOperationContext).aggregateId,
      isReceipt: isIssuerReceipt,
      isError: (value): value is { classification: IssuerErrorClass; kind: string } => isFailure(value, "ISSUER_APPROVAL_FAILURE"),
    }, options);
  }
  begin(input: Parameters<IssuerOperationJournal["begin"]>[0]) { return this.#journal.begin(input.context, input.requestHash, input.partnerIdempotencyKey); }
  commitReceipt(input: Parameters<IssuerOperationJournal["commitReceipt"]>[0]) { return this.#journal.commitReceipt(input.context, input.operationRecordId, input.receipt, input.resolution); }
  recordAttempt(input: Parameters<IssuerOperationJournal["recordAttempt"]>[0]) { return this.#journal.recordAttempt(input.context, input.operationRecordId, input.requestHash, input.attempt, input.status, input.classification); }
  recordFailure(input: Parameters<IssuerOperationJournal["recordFailure"]>[0]) { return this.#journal.recordFailure(input.context, input.operationRecordId, input.classification, input.retryable); }
}

function isIssuerReceipt(value: unknown): value is IssuerApprovalReceipt { return typeof value === "object" && value !== null && "receiptHash" in value && "approved" in value && "requestHash" in value; }
function isFailure(value: unknown, kind: string): boolean { return typeof value === "object" && value !== null && "kind" in value && value.kind === kind && "classification" in value; }
