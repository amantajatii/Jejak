import { DomainError } from "../../shared/errors.js";
import { sha256Hex } from "../../shared/hash.js";
import { parseCanonicalCsv, type CsvLimits } from "../domain/canonical-csv.js";
import type { ParsedIngestion } from "../domain/types.js";

export type CsvObjectReader = {
  read(objectKey: string): Promise<Uint8Array>;
};

export type PersistedIngestionInput = ParsedIngestion & {
  tenantId: string;
  sellerId: string;
  storageObjectKey: string;
  contentHash: string;
  byteCount: number;
};

export type IngestionRepository = {
  persist(input: PersistedIngestionInput): Promise<{ ingestionId: string }>;
};

export async function ingestCanonicalCsv(input: {
  tenantId: string;
  sellerId: string;
  storageObjectKey: string;
  expectedContentHash: string;
  reader: CsvObjectReader;
  repository: IngestionRepository;
  limits?: Partial<CsvLimits>;
}): Promise<{ ingestionId: string; report: ParsedIngestion["report"] }> {
  const bytes = await input.reader.read(input.storageObjectKey);
  const contentHash = sha256Hex(bytes);
  if (contentHash !== input.expectedContentHash) {
    throw new DomainError("VALIDATION_FAILED", "CSV content hash does not match the request.");
  }
  const parsed = parseCanonicalCsv(bytes, input.limits);
  const persisted = await input.repository.persist({
    tenantId: input.tenantId,
    sellerId: input.sellerId,
    storageObjectKey: input.storageObjectKey,
    contentHash,
    byteCount: bytes.byteLength,
    ...parsed,
  });
  return { ingestionId: persisted.ingestionId, report: parsed.report };
}
