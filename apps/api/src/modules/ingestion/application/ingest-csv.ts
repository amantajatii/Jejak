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
  storageObjectKey?: string;
  contentHash: string;
  byteCount?: number;
};

export type PersistedIngestionResult = {
  ingestionId: string;
  report: ParsedIngestion["report"];
  replayed: boolean;
};

export type IngestionView = PersistedIngestionResult & {
  completedAt: string;
  contentHash: string;
  createdAt: string;
  sellerId: string;
  status: "COMPLETED";
  version: number;
};

export type IngestionRepository = {
  findConnection(
    tenantId: string,
    marketplaceConnectionId: string,
  ): Promise<{ sellerId: string } | null>;
  findById(tenantId: string, ingestionId: string): Promise<IngestionView | null>;
  persist(input: PersistedIngestionInput): Promise<PersistedIngestionResult>;
};

export async function readCanonicalCsv(input: {
  storageObjectKey: string;
  expectedContentHash: string;
  reader: CsvObjectReader;
  limits?: Partial<CsvLimits>;
}): Promise<ParsedIngestion & { contentHash: string; byteCount: number }> {
  const bytes = await input.reader.read(input.storageObjectKey);
  const contentHash = sha256Hex(bytes);
  if (contentHash !== input.expectedContentHash) {
    throw new DomainError("VALIDATION_FAILED", "CSV content hash does not match the request.");
  }
  return {
    ...parseCanonicalCsv(bytes, input.limits),
    contentHash,
    byteCount: bytes.byteLength,
  };
}

export async function ingestCanonicalCsv(input: {
  tenantId: string;
  sellerId: string;
  storageObjectKey: string;
  expectedContentHash: string;
  reader: CsvObjectReader;
  repository: IngestionRepository;
  limits?: Partial<CsvLimits>;
}): Promise<{ ingestionId: string; report: ParsedIngestion["report"] }> {
  const parsed = await readCanonicalCsv(input);
  const persisted = await input.repository.persist({
    tenantId: input.tenantId,
    sellerId: input.sellerId,
    storageObjectKey: input.storageObjectKey,
    contentHash: parsed.contentHash,
    byteCount: parsed.byteCount,
    events: parsed.events,
    report: parsed.report,
  });
  return { ingestionId: persisted.ingestionId, report: persisted.report };
}
