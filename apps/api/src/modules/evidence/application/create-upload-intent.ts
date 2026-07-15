import type { EvidenceExpectation, EvidenceUploadIntent } from "../domain/types.js";
import { EvidenceStorageError } from "../domain/types.js";
import type { EvidencePolicyConfig } from "../domain/evidence-policy.js";
import { validateEvidenceExpectation } from "../domain/evidence-policy.js";
import type { EvidenceIntentSigner } from "../domain/intent-proof.js";
import type { EvidenceStorage, EvidenceTelemetry } from "../ports/evidence-storage.js";
import { noopEvidenceTelemetry } from "../ports/evidence-storage.js";

export class CreateEvidenceUploadIntent {
  constructor(
    private readonly storage: EvidenceStorage,
    private readonly policy: EvidencePolicyConfig,
    private readonly signer: EvidenceIntentSigner,
    private readonly telemetry: EvidenceTelemetry = noopEvidenceTelemetry,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  execute(input: EvidenceExpectation): Promise<EvidenceUploadIntent> {
    const validated = validateEvidenceExpectation(input, this.policy);
    const attributes = {
      claimId: validated.claimId,
      evidenceId: validated.evidenceId,
      mode: this.storage.mode,
      operation: "create_upload_intent",
      tenantId: validated.tenantId,
      version: validated.version,
    };
    return this.telemetry.trace("evidence.create_upload_intent", attributes, async () => {
      const startedAt = performance.now();
      try {
        if ((await this.storage.inspectObject(validated.objectKey)) !== null) {
          throw new EvidenceStorageError("EVIDENCE_CONFLICT", "Evidence object already exists.");
        }
        const storageIntent = await this.storage.createUploadIntent(validated.objectKey, validated.contentType);
        const finalizeBy = new Date(this.clock().getTime() + this.policy.finalizationDeadlineSeconds * 1000);
        this.telemetry.count("jejak.evidence.upload_intent.total", { ...attributes, outcome: "success" });
        return {
          ...storageIntent,
          finalizationProof: this.signer.sign(validated, finalizeBy),
          finalizeBy,
        };
      } catch (error) {
        this.telemetry.count("jejak.evidence.upload_intent.total", { ...attributes, outcome: "failed" });
        throw error;
      } finally {
        this.telemetry.observe("jejak.evidence.upload_intent.duration", performance.now() - startedAt, attributes);
      }
    });
  }
}
