export type EvidenceStorageMode = "IN_MEMORY" | "SUPABASE";

export type EvidenceCoordinates = {
  claimId: string;
  evidenceId: string;
  tenantId: string;
  version: number;
};

export type EvidenceExpectation = EvidenceCoordinates & {
  contentType: string;
  sha256: string;
  sizeBytes: number;
};

export type StorageUploadIntent = {
  objectKey: string;
  signedUrl: string;
  storageExpiresAt: Date;
  token: string;
};

export type EvidenceUploadIntent = StorageUploadIntent & {
  finalizeBy: Date;
  finalizationProof: string;
};

export type StoredEvidenceObject = {
  contentType: string;
  createdAt: Date;
  objectKey: string;
  sizeBytes: number;
};

export type StoredEvidenceBody = StoredEvidenceObject & {
  bytes: AsyncIterable<Uint8Array>;
};

export type EvidenceDownloadIntent = {
  expiresAt: Date;
  signedUrl: string;
};

export type EvidenceObjectPage = {
  cursor?: string;
  objects: StoredEvidenceObject[];
};

export type FinalizedEvidence = EvidenceExpectation & {
  documentSecretRef: string;
  finalizedAt: Date;
};

export type CleanupResult = {
  deleted: number;
  inspected: number;
  retained: number;
};

export type EvidenceStorageErrorCode =
  | "EVIDENCE_CONFLICT"
  | "EVIDENCE_INTEGRITY_MISMATCH"
  | "EVIDENCE_NOT_FOUND"
  | "EVIDENCE_STORAGE_UNAVAILABLE"
  | "EVIDENCE_TIMEOUT"
  | "VALIDATION_FAILED";

export class EvidenceStorageError extends Error {
  constructor(
    readonly code: EvidenceStorageErrorCode,
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "EvidenceStorageError";
  }
}
