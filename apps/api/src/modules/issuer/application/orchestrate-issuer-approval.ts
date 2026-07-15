import { canonicalHash } from "../../../reliability/canonical-json.js";
import { IdempotencyConflictError } from "../../../reliability/mutation-coordinator.js";
import { IssuerAdapterError, asIssuerAdapterError } from "../domain/errors.js";
import {
  issuerRequestHash,
  validateIssuerReceipt,
} from "../domain/receipt.js";
import type {
  IssuerApprovalReceipt,
  IssuerApprovalRequest,
  IssuerOperationContext,
} from "../domain/types.js";
import type { IssuerApprovalPort } from "../ports/issuer-approval.js";
import type { IssuerOperationJournal } from "../ports/issuer-journal.js";

export class IssuerApprovalOrchestrator {
  constructor(
    private readonly issuer: IssuerApprovalPort,
    private readonly journal: IssuerOperationJournal,
  ) {}

  async execute(
    context: IssuerOperationContext,
    options: { maxAttempts?: number; sleep?: (attempt: number) => Promise<void> } = {},
  ): Promise<IssuerApprovalReceipt> {
    if (this.issuer.mode !== "SANDBOX") {
      throw new IssuerAdapterError("REJECTED", "No real production issuer approval partner is configured.");
    }
    if (context.transaction.claimId !== context.aggregateId) {
      throw new IssuerAdapterError("REJECTED", "Issuer transaction is outside the authorized aggregate context.");
    }
    const request: IssuerApprovalRequest = {
      correlationId: context.correlationId,
      partnerIdempotencyKey: canonicalHash({
        aggregateId: context.aggregateId,
        correlationId: context.correlationId,
        idempotencyKey: context.idempotencyKey,
        operationId: context.operationId,
        tenantId: context.tenantId,
      }),
      requestedAt: context.requestedAt,
      tenantId: context.tenantId,
      transaction: context.transaction,
    };
    const requestHash = issuerRequestHash(request);
    const decision = await this.journal.begin({
      context,
      partnerIdempotencyKey: request.partnerIdempotencyKey,
      requestHash,
    });
    if (decision.kind === "CONFLICT") throw new IdempotencyConflictError();
    if (decision.kind === "REPLAY") return decision.receipt;
    if (decision.kind === "FAILED") {
      throw new IssuerAdapterError(decision.classification, "Issuer approval previously failed terminally.");
    }

    const maxAttempts = options.maxAttempts ?? 2;
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 5) {
      throw new IssuerAdapterError("REJECTED", "Issuer max attempts must be an integer from 1 through 5.");
    }
    const sleep = options.sleep ?? (async () => undefined);
    let lastError: IssuerAdapterError | undefined;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const receipt = await this.issuer.requestApproval(request);
        validateIssuerReceipt(request, receipt);
        await this.journal.recordAttempt({
          attempt,
          context,
          operationRecordId: decision.operationRecordId,
          requestHash,
          status: "SUCCESS",
        });
        return this.journal.commitReceipt({
          context,
          operationRecordId: decision.operationRecordId,
          partnerIdempotencyKey: request.partnerIdempotencyKey,
          receipt,
          resolution: "DIRECT",
        });
      } catch (rawError) {
        const error = asIssuerAdapterError(rawError);
        lastError = error;
        await this.journal.recordAttempt({
          attempt,
          classification: error.classification,
          context,
          operationRecordId: decision.operationRecordId,
          requestHash,
          status: error.retryable ? "RETRYABLE_FAILURE" : "TERMINAL_FAILURE",
        });
        if (!error.retryable) {
          await this.journal.recordFailure({
            classification: error.classification,
            context,
            operationRecordId: decision.operationRecordId,
            retryable: false,
          });
          throw error;
        }
        if (attempt < maxAttempts) await sleep(attempt);
      }
    }

    const reconciled = await this.issuer.findApproval(request.partnerIdempotencyKey);
    if (reconciled !== null) {
      validateIssuerReceipt(request, reconciled);
      return this.journal.commitReceipt({
        context,
        operationRecordId: decision.operationRecordId,
        partnerIdempotencyKey: request.partnerIdempotencyKey,
        receipt: reconciled,
        resolution: "RECONCILED",
      });
    }
    const failure = lastError ?? new IssuerAdapterError("TRANSPORT", "Issuer did not return an approval result.");
    await this.journal.recordFailure({
      classification: failure.classification,
      context,
      operationRecordId: decision.operationRecordId,
      retryable: true,
    });
    throw failure;
  }
}
