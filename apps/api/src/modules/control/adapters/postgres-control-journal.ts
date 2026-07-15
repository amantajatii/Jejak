import type { JejakDatabase } from "../../../db/client.js";
import { PostgresPartnerJournal } from "../../shared/postgres-partner-journal.js";
import type { ControlErrorClass } from "../domain/errors.js";
import type { ControlOperationContext, ControlReceipt } from "../domain/types.js";
import type { ControlOperationJournal } from "../ports/control-journal.js";

export class PostgresControlOperationJournal implements ControlOperationJournal {
  readonly #journal: PostgresPartnerJournal<ControlReceipt, ControlErrorClass>;
  constructor(database: JejakDatabase, options: { nextId?: () => string; now?: () => Date } = {}) {
    this.#journal = new PostgresPartnerJournal(database, {
      eventPrefix: "control.evidence", kind: "CONTROL_EVIDENCE", partner: "CONTROL_SANDBOX", resourceType: "CONTROL_EVIDENCE",
      resourceId: (context) => (context as ControlOperationContext).evidenceId,
      isReceipt: isControlReceipt,
      isError: (value): value is { classification: ControlErrorClass; kind: string } => isFailure(value, "CONTROL_EVIDENCE_FAILURE"),
    }, options);
  }
  begin(input: Parameters<ControlOperationJournal["begin"]>[0]) { return this.#journal.begin(input.context, input.requestHash, input.partnerIdempotencyKey); }
  commitReceipt(input: Parameters<ControlOperationJournal["commitReceipt"]>[0]) { return this.#journal.commitReceipt(input.context, input.operationRecordId, input.receipt, input.resolution); }
  recordAttempt(input: Parameters<ControlOperationJournal["recordAttempt"]>[0]) { return this.#journal.recordAttempt(input.context, input.operationRecordId, input.requestHash, input.attempt, input.status, input.classification); }
  recordFailure(input: Parameters<ControlOperationJournal["recordFailure"]>[0]) { return this.#journal.recordFailure(input.context, input.operationRecordId, input.classification, input.retryable); }
}

function isControlReceipt(value: unknown): value is ControlReceipt { return typeof value === "object" && value !== null && "receiptHash" in value && "status" in value && "requestHash" in value; }
function isFailure(value: unknown, kind: string): boolean { return typeof value === "object" && value !== null && "kind" in value && value.kind === kind && "classification" in value; }
