import { createHash } from "node:crypto";

import { createDocumentSecretRef } from "../domain/evidence-key.js";
import type { EvidencePolicyConfig } from "../domain/evidence-policy.js";
import { validateEvidenceExpectation } from "../domain/evidence-policy.js";
import type { EvidenceIntentSigner } from "../domain/intent-proof.js";
import type { FinalizedEvidence } from "../domain/types.js";
import { EvidenceStorageError } from "../domain/types.js";
import type {
  EvidenceReferenceRegistry,
  EvidenceStorage,
  EvidenceTelemetry,
} from "../ports/evidence-storage.js";
import { noopEvidenceTelemetry } from "../ports/evidence-storage.js";

export class FinalizeEvidence {
  constructor(
    private readonly storage: EvidenceStorage,
    private readonly registry: EvidenceReferenceRegistry,
    private readonly policy: EvidencePolicyConfig,
    private readonly signer: EvidenceIntentSigner,
    private readonly telemetry: EvidenceTelemetry = noopEvidenceTelemetry,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async execute(input: { authorizedTenantId: string; finalizationProof: string }): Promise<FinalizedEvidence> {
    const proof = this.signer.verify(input.finalizationProof);
    const validated = validateEvidenceExpectation(proof.expectation, this.policy);
    if (validated.tenantId !== input.authorizedTenantId) {
      throw new EvidenceStorageError("EVIDENCE_NOT_FOUND", "Evidence object was not found.");
    }
    if (proof.finalizeBy.getTime() < this.clock().getTime()) {
      throw new EvidenceStorageError("VALIDATION_FAILED", "Evidence finalization deadline has expired.");
    }
    const attributes = {
      claimId: validated.claimId,
      evidenceId: validated.evidenceId,
      mode: this.storage.mode,
      operation: "finalize",
      tenantId: validated.tenantId,
      version: validated.version,
    };
    return this.telemetry.trace("evidence.finalize", attributes, async () => {
      const existing = await this.registry.findFinalized(validated.objectKey);
      if (existing !== null) {
        if (
          existing.sha256 === validated.sha256 &&
          existing.sizeBytes === validated.sizeBytes &&
          existing.contentType === validated.contentType
        ) return existing;
        throw new EvidenceStorageError("EVIDENCE_CONFLICT", "Evidence was finalized with different metadata.");
      }

      const startedAt = performance.now();
      const stored = await this.storage.readObject(validated.objectKey);
      if (stored === null) throw new EvidenceStorageError("EVIDENCE_NOT_FOUND", "Evidence object was not found.");
      const hash = createHash("sha256");
      let processed = 0;
      for await (const chunk of stored.bytes) {
        processed += chunk.byteLength;
        if (processed > this.policy.maxBytes || processed > validated.sizeBytes) {
          await this.#rejectMismatch(validated.objectKey, attributes);
        }
        hash.update(chunk);
      }
      const actualHash = hash.digest("hex");
      if (
        processed !== validated.sizeBytes ||
        stored.sizeBytes !== validated.sizeBytes ||
        stored.contentType.toLowerCase() !== validated.contentType ||
        actualHash !== validated.sha256
      ) {
        await this.#rejectMismatch(validated.objectKey, attributes);
      }
      const finalizedAt = this.clock();
      this.telemetry.count("jejak.evidence.finalization.total", { ...attributes, outcome: "success" });
      this.telemetry.observe("jejak.evidence.finalization.duration", performance.now() - startedAt, attributes);
      this.telemetry.observe("jejak.evidence.verification.bytes", processed, attributes);
      return {
        ...validated,
        documentSecretRef: createDocumentSecretRef(this.storage.bucket, validated.objectKey),
        finalizedAt,
      };
    });
  }

  async #rejectMismatch(
    objectKey: string,
    attributes: Record<string, string | number | boolean>,
  ): Promise<never> {
    try {
      await this.storage.removeObject(objectKey);
    } finally {
      this.telemetry.count("jejak.evidence.integrity_mismatch.total", attributes);
      this.telemetry.count("jejak.evidence.finalization.total", { ...attributes, outcome: "integrity_mismatch" });
    }
    throw new EvidenceStorageError("EVIDENCE_INTEGRITY_MISMATCH", "Stored evidence failed integrity verification.");
  }
}
