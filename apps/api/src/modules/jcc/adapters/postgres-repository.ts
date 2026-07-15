import { and, eq } from "drizzle-orm";

import type { JejakDatabase } from "../../../db/client.js";
import { withTenantTransaction, type TransactionActorContext } from "../../../db/context.js";
import { eligibilityAttestations } from "../../../db/schema/domain.js";
import { canonicalHash } from "../../../reliability/canonical-json.js";
import { assertSameSignedEnvelope, type SignedJccEnvelope } from "../domain/attestation.js";
import type { JccRepository, PersistedJcc } from "../ports/index.js";

type StoredPayload = { envelope: SignedJccEnvelope };

function persisted(row: {
  canonicalPayload: unknown;
  status: string;
  version: number;
}): PersistedJcc {
  const payload = row.canonicalPayload as StoredPayload;
  if (payload.envelope.envelopeHash !== canonicalHash(JSON.parse(payload.envelope.canonicalEnvelope))) {
    throw new Error("Persisted JCC canonical envelope hash does not reconcile.");
  }
  return {
    envelope: payload.envelope,
    operationalStatus: row.status as PersistedJcc["operationalStatus"],
    version: row.version,
  };
}

export class PostgresJccRepository implements JccRepository {
  constructor(
    private readonly database: JejakDatabase,
    private readonly options: { actorContext?: TransactionActorContext; now?: () => Date } = {},
  ) {}

  private run<T>(tenantId: string, work: (database: JejakDatabase) => Promise<T>): Promise<T> {
    if (this.options.actorContext === undefined) return work(this.database);
    if (this.options.actorContext.tenantId !== tenantId) {
      return Promise.reject(new Error("JCC repository tenant does not match its actor context."));
    }
    return withTenantTransaction(this.database, this.options.actorContext, work);
  }

  private async find(database: JejakDatabase, input: { attestationId: string; tenantId: string }) {
    const [row] = await database
      .select({
        canonicalPayload: eligibilityAttestations.canonicalPayload,
        status: eligibilityAttestations.status,
        version: eligibilityAttestations.version,
      })
      .from(eligibilityAttestations)
      .where(
        and(
          eq(eligibilityAttestations.tenantId, input.tenantId),
          eq(eligibilityAttestations.id, input.attestationId),
        ),
      )
      .limit(1);
    return row === undefined ? null : persisted(row);
  }

  async findById(input: { attestationId: string; tenantId: string }): Promise<PersistedJcc | null> {
    return this.run(input.tenantId, (database) => this.find(database, input));
  }

  async insertOrFind(input: { envelope: SignedJccEnvelope; tenantId: string }): Promise<PersistedJcc> {
    const attestation = input.envelope.attestation;
    const createdAt = new Date(attestation.issuedAt);
    return this.run(input.tenantId, async (database) => {
    const [inserted] = await database
      .insert(eligibilityAttestations)
      .values({
        id: attestation.id,
        tenantId: input.tenantId,
        claimId: attestation.claimId,
        signerKeyId: attestation.keyId,
        envelopeHash: input.envelope.envelopeHash,
        status: "PENDING_REGISTRATION",
        sdsBps: attestation.sdsBps,
        expiresAt: new Date(attestation.expiresAt),
        canonicalPayload: { envelope: input.envelope },
        createdAt,
        updatedAt: createdAt,
        version: 1,
      })
      .onConflictDoNothing()
      .returning({ id: eligibilityAttestations.id });
    const result = await this.find(database, { attestationId: attestation.id, tenantId: input.tenantId });
    if (result === null) throw new Error("JCC insert conflict did not resolve to a tenant record.");
    assertSameSignedEnvelope(input.envelope, result.envelope);
    if (inserted === undefined && result.envelope.envelopeHash !== input.envelope.envelopeHash) {
      throw new Error("JCC attestation identity conflicts with a different envelope.");
    }
    return result;
    });
  }

  async updateOperationalStatus(
    input: Parameters<JccRepository["updateOperationalStatus"]>[0],
  ): Promise<PersistedJcc> {
    return this.run(input.tenantId, async (database) => {
    const [updated] = await database
      .update(eligibilityAttestations)
      .set({ status: input.status, updatedAt: (this.options.now ?? (() => new Date()))(), version: input.expectedVersion + 1 })
      .where(
        and(
          eq(eligibilityAttestations.tenantId, input.tenantId),
          eq(eligibilityAttestations.id, input.attestationId),
          eq(eligibilityAttestations.version, input.expectedVersion),
        ),
      )
      .returning({
        canonicalPayload: eligibilityAttestations.canonicalPayload,
        status: eligibilityAttestations.status,
        version: eligibilityAttestations.version,
      });
    if (updated === undefined) throw new Error("JCC operational status version conflict.");
    return persisted(updated);
    });
  }
}
