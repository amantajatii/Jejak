import type {
  EvidenceDownloadIntent,
  EvidenceObjectPage,
  EvidenceStorageMode,
  FinalizedEvidence,
  StorageUploadIntent,
  StoredEvidenceBody,
  StoredEvidenceObject,
} from "../domain/types.js";

export type EvidenceStorage = {
  readonly bucket: string;
  readonly mode: EvidenceStorageMode;
  close(): Promise<void>;
  createDownloadIntent(objectKey: string, expiresInSeconds: number): Promise<EvidenceDownloadIntent>;
  createUploadIntent(objectKey: string, contentType: string): Promise<StorageUploadIntent>;
  inspectObject(objectKey: string): Promise<StoredEvidenceObject | null>;
  listObjects(input: { cursor?: string; limit: number; prefix: string }): Promise<EvidenceObjectPage>;
  readObject(objectKey: string): Promise<StoredEvidenceBody | null>;
  removeObject(objectKey: string): Promise<void>;
};

export type ReadinessCapableEvidenceStorage = EvidenceStorage & {
  checkReady(): Promise<boolean>;
};

export type EvidenceReferenceRegistry = {
  findFinalized(objectKey: string): Promise<FinalizedEvidence | null>;
  isFinalized(objectKey: string): Promise<boolean>;
};

export type EvidenceTelemetry = {
  count(name: string, attributes: Record<string, string | number | boolean>): void;
  observe(name: string, value: number, attributes: Record<string, string | number | boolean>): void;
  trace<T>(
    name: string,
    attributes: Record<string, string | number | boolean>,
    work: () => Promise<T>,
  ): Promise<T>;
};

export const noopEvidenceTelemetry: EvidenceTelemetry = {
  count: () => undefined,
  observe: () => undefined,
  trace: async (_name, _attributes, work) => work(),
};
