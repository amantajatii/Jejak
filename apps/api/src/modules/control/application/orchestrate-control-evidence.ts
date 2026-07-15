import { canonicalHash } from "../../../reliability/canonical-json.js";
import { IdempotencyConflictError } from "../../../reliability/mutation-coordinator.js";
import type { FinalizedEvidence } from "../../evidence/index.js";
import { ControlAdapterError, asControlAdapterError } from "../domain/errors.js";
import {
  controlRequestHash,
  validateControlReceipt,
} from "../domain/receipt.js";
import type {
  ControlEvidenceRequest,
  ControlEvidenceStructure,
  ControlOperationContext,
  ControlReceipt,
  SafeControlMetadata,
} from "../domain/types.js";
import type { ControlEvidencePort } from "../ports/control-evidence.js";
import type { ControlOperationJournal } from "../ports/control-journal.js";

export class ControlEvidenceOrchestrator {
  constructor(
    private readonly partner: ControlEvidencePort,
    private readonly journal: ControlOperationJournal,
  ) {}

  async execute(
    context: ControlOperationContext,
    input: {
      evidence: FinalizedEvidence;
      safeMetadata?: SafeControlMetadata;
      structure: ControlEvidenceStructure;
    },
    options: { maxAttempts?: number; sleep?: (attempt: number) => Promise<void> } = {},
  ): Promise<ControlReceipt> {
    if (this.partner.mode !== "SANDBOX") {
      throw new ControlAdapterError("REJECTED", "No production control-evidence partner is configured.");
    }
    assertEvidenceContext(context, input.evidence);
    const request: ControlEvidenceRequest = {
      claimId: input.evidence.claimId,
      contentType: input.evidence.contentType,
      documentSecretRef: input.evidence.documentSecretRef,
      evidenceHash: input.evidence.sha256,
      evidenceId: input.evidence.evidenceId,
      partnerIdempotencyKey: canonicalHash({
        claimId: context.claimId,
        evidenceId: context.evidenceId,
        idempotencyKey: context.idempotencyKey,
        operationId: context.operationId,
        tenantId: context.tenantId,
      }),
      requestedAt: context.requestedAt,
      safeMetadata: input.safeMetadata ?? {},
      sizeBytes: input.evidence.sizeBytes,
      structure: input.structure,
      tenantId: input.evidence.tenantId,
      version: input.evidence.version,
    };
    const requestHash = controlRequestHash(request);
    const decision = await this.journal.begin({
      context,
      partnerIdempotencyKey: request.partnerIdempotencyKey,
      requestHash,
    });
    if (decision.kind === "CONFLICT") throw new IdempotencyConflictError();
    if (decision.kind === "REPLAY") return decision.receipt;
    if (decision.kind === "FAILED") {
      throw new ControlAdapterError(decision.classification, "Control operation previously failed terminally.");
    }

    const maxAttempts = options.maxAttempts ?? 2;
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 5) {
      throw new ControlAdapterError("REJECTED", "Control max attempts must be an integer from 1 through 5.");
    }
    const sleep = options.sleep ?? (async () => undefined);
    let lastError: ControlAdapterError | undefined;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const receipt = await this.partner.verifyControl(request);
        validateControlReceipt(request, receipt);
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
        const error = asControlAdapterError(rawError);
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

    const reconciled = await this.partner.findDecision(request.partnerIdempotencyKey);
    if (reconciled !== null) {
      validateControlReceipt(request, reconciled);
      return this.journal.commitReceipt({
        context,
        operationRecordId: decision.operationRecordId,
        partnerIdempotencyKey: request.partnerIdempotencyKey,
        receipt: reconciled,
        resolution: "RECONCILED",
      });
    }
    const failure = lastError ?? new ControlAdapterError("TRANSPORT", "Control partner did not return a result.");
    await this.journal.recordFailure({
      classification: failure.classification,
      context,
      operationRecordId: decision.operationRecordId,
      retryable: true,
    });
    throw failure;
  }
}

function assertEvidenceContext(context: ControlOperationContext, evidence: FinalizedEvidence): void {
  if (
    evidence.tenantId !== context.tenantId ||
    evidence.claimId !== context.claimId ||
    evidence.evidenceId !== context.evidenceId
  ) {
    throw new ControlAdapterError("REJECTED", "Finalized evidence is outside the authorized control context.");
  }
}
