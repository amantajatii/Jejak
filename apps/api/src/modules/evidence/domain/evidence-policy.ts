import type { EvidenceExpectation } from "./types.js";
import { EvidenceStorageError } from "./types.js";
import { buildEvidenceObjectKey } from "./evidence-key.js";

export type EvidencePolicyConfig = {
  allowedContentTypes: ReadonlySet<string>;
  cleanupBatchSize: number;
  downloadTtlSeconds: number;
  finalizationDeadlineSeconds: number;
  maxBytes: number;
};

export const defaultEvidencePolicy: EvidencePolicyConfig = {
  allowedContentTypes: new Set(["application/pdf", "image/jpeg", "image/png"]),
  cleanupBatchSize: 100,
  downloadTtlSeconds: 300,
  finalizationDeadlineSeconds: 900,
  maxBytes: 10 * 1024 * 1024,
};

export function validateEvidencePolicy(config: EvidencePolicyConfig): void {
  if (config.allowedContentTypes.size === 0) throw new EvidenceStorageError("VALIDATION_FAILED", "At least one content type is required.");
  if (!Number.isSafeInteger(config.maxBytes) || config.maxBytes < 1) throw new EvidenceStorageError("VALIDATION_FAILED", "Evidence maximum size is invalid.");
  if (!Number.isSafeInteger(config.finalizationDeadlineSeconds) || config.finalizationDeadlineSeconds < 60 || config.finalizationDeadlineSeconds > 3600) {
    throw new EvidenceStorageError("VALIDATION_FAILED", "Finalization deadline must be between 60 and 3600 seconds.");
  }
  if (!Number.isSafeInteger(config.downloadTtlSeconds) || config.downloadTtlSeconds < 30 || config.downloadTtlSeconds > 3600) {
    throw new EvidenceStorageError("VALIDATION_FAILED", "Download TTL must be between 30 and 3600 seconds.");
  }
  if (!Number.isSafeInteger(config.cleanupBatchSize) || config.cleanupBatchSize < 1 || config.cleanupBatchSize > 1000) {
    throw new EvidenceStorageError("VALIDATION_FAILED", "Cleanup batch size must be between 1 and 1000.");
  }
}

export function validateEvidenceExpectation(
  input: EvidenceExpectation,
  config: EvidencePolicyConfig,
): EvidenceExpectation & { objectKey: string } {
  validateEvidencePolicy(config);
  const contentType = input.contentType.trim().toLowerCase();
  if (!config.allowedContentTypes.has(contentType)) {
    throw new EvidenceStorageError("VALIDATION_FAILED", "Evidence content type is not allowed.");
  }
  if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes < 1 || input.sizeBytes > config.maxBytes) {
    throw new EvidenceStorageError("VALIDATION_FAILED", "Evidence size is outside the allowed range.");
  }
  const sha256 = input.sha256.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(sha256)) {
    throw new EvidenceStorageError("VALIDATION_FAILED", "Evidence SHA-256 is invalid.");
  }
  return { ...input, contentType, objectKey: buildEvidenceObjectKey(input), sha256 };
}
