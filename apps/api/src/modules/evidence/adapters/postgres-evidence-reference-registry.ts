import { and, eq } from "drizzle-orm";

import type { JejakDatabase } from "../../../db/client.js";
import { withTenantTransaction, type TransactionActorContext } from "../../../db/context.js";
import { controlEvidence } from "../../../db/schema/domain.js";
import { createDocumentSecretRef, parseEvidenceObjectKey } from "../domain/evidence-key.js";
import type { FinalizedEvidence } from "../domain/types.js";
import type { EvidenceReferenceRegistry } from "../ports/evidence-storage.js";

type FinalizedMetadata = { contentType?: unknown; finalizedAt?: unknown; sizeBytes?: unknown; evidenceVersion?: unknown };

export class PostgresEvidenceReferenceRegistry implements EvidenceReferenceRegistry {
  constructor(
    private readonly database: JejakDatabase,
    private readonly actor: TransactionActorContext,
    private readonly bucket: string,
  ) {}

  async findFinalized(objectKey: string): Promise<FinalizedEvidence | null> {
    const coordinates = parseEvidenceObjectKey(objectKey);
    if (coordinates.tenantId !== this.actor.tenantId) return null;
    return withTenantTransaction(this.database, this.actor, async (database) => {
      const [row] = await database.select({
        canonicalPayload: controlEvidence.canonicalPayload,
        documentSecretRef: controlEvidence.documentSecretRef,
        evidenceHash: controlEvidence.evidenceHash,
      }).from(controlEvidence).where(and(
        eq(controlEvidence.tenantId, coordinates.tenantId),
        eq(controlEvidence.id, coordinates.evidenceId),
        eq(controlEvidence.claimId, coordinates.claimId),
      )).limit(1);
      if (row === undefined || row.documentSecretRef !== createDocumentSecretRef(this.bucket, objectKey)) return null;
      const metadata = row.canonicalPayload as FinalizedMetadata;
      if (metadata.evidenceVersion !== coordinates.version || typeof metadata.contentType !== "string" || typeof metadata.sizeBytes !== "number" || typeof metadata.finalizedAt !== "string") return null;
      return { ...coordinates, contentType: metadata.contentType, sizeBytes: metadata.sizeBytes, sha256: row.evidenceHash, documentSecretRef: row.documentSecretRef, finalizedAt: new Date(metadata.finalizedAt) };
    });
  }

  async isFinalized(objectKey: string): Promise<boolean> { return (await this.findFinalized(objectKey)) !== null; }
}
