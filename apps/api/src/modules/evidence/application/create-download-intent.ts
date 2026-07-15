import { parseDocumentSecretRef, parseEvidenceObjectKey } from "../domain/evidence-key.js";
import type { EvidencePolicyConfig } from "../domain/evidence-policy.js";
import type { EvidenceDownloadIntent } from "../domain/types.js";
import { EvidenceStorageError } from "../domain/types.js";
import type { EvidenceStorage, EvidenceTelemetry } from "../ports/evidence-storage.js";
import { noopEvidenceTelemetry } from "../ports/evidence-storage.js";

export class CreateEvidenceDownloadIntent {
  constructor(
    private readonly storage: EvidenceStorage,
    private readonly policy: EvidencePolicyConfig,
    private readonly telemetry: EvidenceTelemetry = noopEvidenceTelemetry,
  ) {}

  execute(input: { authorizedTenantId: string; documentSecretRef: string }): Promise<EvidenceDownloadIntent> {
    const reference = parseDocumentSecretRef(input.documentSecretRef);
    const coordinates = parseEvidenceObjectKey(reference.objectKey);
    if (reference.bucket !== this.storage.bucket || coordinates.tenantId !== input.authorizedTenantId) {
      throw new EvidenceStorageError("EVIDENCE_NOT_FOUND", "Evidence object was not found.");
    }
    const attributes = {
      claimId: coordinates.claimId,
      evidenceId: coordinates.evidenceId,
      mode: this.storage.mode,
      operation: "create_download_intent",
      tenantId: coordinates.tenantId,
      version: coordinates.version,
    };
    return this.telemetry.trace("evidence.create_download_intent", attributes, async () => {
      if ((await this.storage.inspectObject(reference.objectKey)) === null) {
        throw new EvidenceStorageError("EVIDENCE_NOT_FOUND", "Evidence object was not found.");
      }
      return this.storage.createDownloadIntent(reference.objectKey, this.policy.downloadTtlSeconds);
    });
  }
}
