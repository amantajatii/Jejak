import { ControlAdapterError } from "../domain/errors.js";
import type {
  ControlEvidenceApplicationServices,
  ControlOperationContext,
  FinalizedControlDecision,
  SubmitFinalizedControlEvidenceInput,
} from "../domain/types.js";
import { ControlEvidenceOrchestrator } from "./orchestrate-control-evidence.js";

/**
 * Framework-neutral composition boundary for the integration owner.
 * Authentication, assignment checks, claim-state checks, and the durable transaction
 * remain the caller's responsibility. This class never accepts document bytes.
 */
export class ControlEvidenceHandler {
  constructor(
    private readonly evidence: ControlEvidenceApplicationServices,
    private readonly orchestrator: ControlEvidenceOrchestrator,
  ) {}

  createUploadIntent(
    context: ControlOperationContext,
    input: Parameters<ControlEvidenceApplicationServices["createUploadIntent"]["execute"]>[0],
  ) {
    assertCoordinates(context, input);
    return this.evidence.createUploadIntent.execute(input);
  }

  async finalizeAndVerify(
    context: ControlOperationContext,
    input: SubmitFinalizedControlEvidenceInput,
    options: { maxAttempts?: number; sleep?: (attempt: number) => Promise<void> } = {},
  ): Promise<FinalizedControlDecision> {
    const finalized = await this.evidence.finalizeEvidence.execute({
      authorizedTenantId: context.tenantId,
      finalizationProof: input.finalizationProof,
    });
    assertCoordinates(context, finalized);
    const receipt = await this.orchestrator.execute(
      context,
      {
        evidence: finalized,
        ...(input.safeMetadata === undefined ? {} : { safeMetadata: input.safeMetadata }),
        structure: input.structure,
      },
      options,
    );
    return { evidence: finalized, receipt };
  }

  createDownloadIntent(
    context: ControlOperationContext,
    documentSecretRef: string,
  ) {
    return this.evidence.createDownloadIntent.execute({
      authorizedTenantId: context.tenantId,
      documentSecretRef,
    });
  }
}

function assertCoordinates(
  context: ControlOperationContext,
  coordinates: { claimId: string; evidenceId: string; tenantId: string },
): void {
  if (
    coordinates.tenantId !== context.tenantId ||
    coordinates.claimId !== context.claimId ||
    coordinates.evidenceId !== context.evidenceId
  ) {
    throw new ControlAdapterError("REJECTED", "Evidence coordinates do not match the authorized control context.");
  }
}
