import { and, count, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { createDatabase, type JejakDatabase } from "../src/db/client.js";
import { auditEvents, claims, resourceAssignments } from "../src/db/schema/index.js";
import { DemoResetService, deterministicUuidV7, PostgresDemoResetRepository } from "../src/modules/demo/index.js";

const liveDatabaseUrl = process.env.JEJAK_DEMO_RESET_LIVE_DATABASE_URL;
const liveEnabled = process.env.JEJAK_RUN_LIVE_DEMO_RESET === "true" && liveDatabaseUrl !== undefined;
class RollbackAcceptance extends Error {}

describe.skipIf(!liveEnabled)("P1-03 live PostgreSQL demo reset", () => {
  it("commits replayable prerequisites atomically and keeps reset tenants isolated", async () => {
    const handle = createDatabase(liveDatabaseUrl as string);
    const prefix = deterministicUuidV7(`live-demo-reset:${Date.now()}`);
    try {
      await handle.db.transaction(async (transaction) => {
        const database = transaction as unknown as JejakDatabase;
        const service = new DemoResetService(new PostgresDemoResetRepository(database), {
          now: () => new Date("2026-07-15T12:00:00.000Z"),
        });
        const first = await service.reset({
          idempotencyKey: `${prefix}:happy-reset`,
          requestId: deterministicUuidV7(`${prefix}:request-1`),
          scenario: "HAPPY",
        });
        const replay = await service.reset({
          idempotencyKey: `${prefix}:happy-reset`,
          requestId: deterministicUuidV7(`${prefix}:request-2`),
          scenario: "HAPPY",
        });
        expect(replay).toEqual(first);
        await expect(
          service.reset({
            idempotencyKey: `${prefix}:happy-reset`,
            requestId: deterministicUuidV7(`${prefix}:request-3`),
            scenario: "ADVERSE",
          }),
        ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });

        const adverse = await service.reset({
          idempotencyKey: `${prefix}:adverse-reset`,
          requestId: deterministicUuidV7(`${prefix}:request-4`),
          scenario: "ADVERSE",
        });
        expect(adverse).toMatchObject({ claimState: "FUNDED", scenario: "ADVERSE" });
        expect(adverse.tenantId).not.toBe(first.tenantId);
        await expect(service.getContext(first.tenantId)).resolves.toEqual(first);
        await expect(service.getContext(adverse.tenantId)).resolves.toEqual(adverse);

        for (const context of [first, adverse]) {
          const [evidence] = await database.select({
            assignments: count(resourceAssignments.id),
          }).from(resourceAssignments).where(eq(resourceAssignments.tenantId, context.tenantId));
          expect(evidence?.assignments).toBe(6);
          const [audit] = await database
            .select({ references: auditEvents.references })
            .from(auditEvents)
            .where(and(
              eq(auditEvents.tenantId, context.tenantId),
              eq(auditEvents.action, "demo.prerequisites.seeded"),
            ))
            .limit(1);
          expect(audit?.references).toMatchObject({
            provenance: "DEMO_RESET",
            scenario: context.scenario,
          });
          const [claim] = await database
            .select({ canonicalPayload: claims.canonicalPayload })
            .from(claims)
            .where(and(eq(claims.tenantId, context.tenantId), eq(claims.id, context.claimId)))
            .limit(1);
          expect(JSON.stringify(claim?.canonicalPayload)).not.toMatch(/transactionHash|jcc|signature/i);
        }
        throw new RollbackAcceptance();
      });
    } catch (error) {
      if (!(error instanceof RollbackAcceptance)) throw error;
    } finally {
      await handle.close();
    }
  }, 120_000);
});
