import { describe, expect, it } from "vitest";
import { v7 as uuidv7 } from "uuid";
import { and, eq } from "drizzle-orm";

import { createDatabase, type JejakDatabase } from "../src/db/client.js";
import { marketplaceConnections, sellers } from "../src/db/schema/domain.js";
import { decisionSnapshotMetadata } from "../src/db/schema/lifecycle.js";
import { organizations } from "../src/db/schema/identity.js";
import {
  createPostgresCsvIngestionApplication,
  findPostgresIngestion,
} from "../src/modules/ingestion/application/postgres-composition.js";
import { csvSourceNamespace } from "../src/modules/ingestion/application/csv-ingestion-application.js";
import { createPostgresDecisionSnapshotApplication } from "../src/modules/reconciliation/application/postgres-composition.js";
import { sha256Hex } from "../src/modules/shared/hash.js";

const liveDatabaseUrl = process.env.JEJAK_BE0506_LIVE_DATABASE_URL;
const liveEnabled = process.env.JEJAK_RUN_LIVE_BE0506 === "true" && liveDatabaseUrl !== undefined;

class RollbackAcceptance extends Error {}

describe.skipIf(!liveEnabled)("BE-05/BE-06 live PostgreSQL repositories", () => {
  it("proves atomic insert, replay, tenant isolation, and immutable snapshot metadata", async () => {
    const handle = createDatabase(liveDatabaseUrl as string);
    const tenantA = uuidv7();
    const tenantB = uuidv7();
    const sellerA = uuidv7();
    const connectionA = uuidv7();
    const actorA = uuidv7();
    const body = new TextEncoder().encode(
      [
        "external_event_id,event_type,occurred_at,amount_minor,currency,scale",
        "event-1,ORDER_SETTLED,2026-07-15T00:01:00Z,10000,TIDR,2",
        "event-2,REFUND,2026-07-15T00:02:00Z,1000,TIDR,2",
      ].join("\n"),
    );

    try {
      await handle.db.transaction(async (transaction) => {
        const database = transaction as unknown as JejakDatabase;
        await transaction.insert(organizations).values([
          {
            id: tenantA,
            name: "BE0506 Live Tenant A",
            organizationType: "TEST",
            sellerSubjectSaltRef: `test:${tenantA}`,
            slug: `be0506-${tenantA}`,
          },
          {
            id: tenantB,
            name: "BE0506 Live Tenant B",
            organizationType: "TEST",
            sellerSubjectSaltRef: `test:${tenantB}`,
            slug: `be0506-${tenantB}`,
          },
        ]);
        await transaction.insert(sellers).values({
          canonicalPayload: {},
          id: sellerA,
          sellerSubject: `seller:${sellerA}`,
          status: "ACTIVE",
          tenantId: tenantA,
        });
        await transaction.insert(marketplaceConnections).values({
          canonicalPayload: {},
          externalId: `sandbox:${connectionA}`,
          id: connectionA,
          sellerId: sellerA,
          source: "SANDBOX",
          status: "ACTIVE",
          tenantId: tenantA,
        });

        const context = {
          actorId: actorA,
          idempotencyKey: "be0506-live-ingestion-1",
          requestId: uuidv7(),
          tenantId: tenantA,
        };
        const application = createPostgresCsvIngestionApplication({
          context,
          database,
          reader: { read: async () => body },
        });
        const first = await application.ingest({
          contentHash: sha256Hex(body),
          sellerId: sellerA,
          storageObjectKey: `private/${tenantA}/marketplace.csv`,
        });
        const duplicate = await createPostgresCsvIngestionApplication({
          context: { ...context, idempotencyKey: "be0506-live-ingestion-2" },
          database,
          reader: { read: async () => body },
        }).ingest({
          contentHash: sha256Hex(body),
          sellerId: sellerA,
          storageObjectKey: `private/${tenantA}/marketplace-copy.csv`,
        });
        expect(duplicate.ingestionId).toBe(first.ingestionId);
        expect(duplicate.replayed).toBe(true);

        const conflictingBody = new TextEncoder().encode(
          [
            "external_event_id,event_type,occurred_at,amount_minor,currency,scale",
            "event-1,ORDER_SETTLED,2026-07-15T00:01:00Z,99999,TIDR,2",
          ].join("\n"),
        );
        const conflict = await createPostgresCsvIngestionApplication({
          context: { ...context, idempotencyKey: "be0506-live-ingestion-3" },
          database,
          reader: { read: async () => conflictingBody },
        }).ingest({
          contentHash: sha256Hex(conflictingBody),
          sellerId: sellerA,
          storageObjectKey: `private/${tenantA}/marketplace-conflict.csv`,
        });
        expect(conflict.report).toMatchObject({
          issues: [{ blocksAutomation: true, code: "DATA_INCONSISTENT" }],
          rejectedRows: 1,
          validUniqueRows: 0,
        });

        await expect(
          findPostgresIngestion({
            context: { ...context, tenantId: tenantB },
            database,
            ingestionId: first.ingestionId,
          }),
        ).resolves.toBeNull();

        const snapshotApplication = createPostgresDecisionSnapshotApplication({
          context,
          database,
        });
        const snapshotInput = {
          cutoffAt: "2026-07-15T00:02:00Z",
          ingestionId: first.ingestionId,
          marketplaceConnectionId: connectionA,
          moneyUnit: { amountMinor: "0", currency: "TIDR", scale: 2 },
          sellerId: sellerA,
          sourceNamespace: csvSourceNamespace(sellerA),
        };
        const snapshot = await snapshotApplication.create(snapshotInput);
        const snapshotReplay = await snapshotApplication.create(snapshotInput);
        expect(snapshotReplay).toEqual(snapshot);

        let immutableRejected = false;
        try {
          await database.transaction(async (savepoint) => {
            await savepoint
              .update(decisionSnapshotMetadata)
              .set({ qualityReportHash: "0".repeat(64) })
              .where(
                and(
                  eq(decisionSnapshotMetadata.tenantId, tenantA),
                  eq(decisionSnapshotMetadata.settlementStreamId, snapshot.id),
                ),
              );
          });
        } catch (error) {
          immutableRejected = (error as { code?: string }).code === "55000";
        }
        expect(immutableRejected).toBe(true);
        throw new RollbackAcceptance();
      });
    } catch (error) {
      if (!(error instanceof RollbackAcceptance)) throw error;
    } finally {
      await handle.close();
    }
  });
});
