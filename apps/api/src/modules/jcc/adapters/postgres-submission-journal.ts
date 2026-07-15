import { and, eq, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";

import type { JejakDatabase } from "../../../db/client.js";
import { withTenantTransaction, type TransactionActorContext } from "../../../db/context.js";
import { chainSubmissions, operations } from "../../../db/schema/reliability.js";
import type { JccSubmissionJournal } from "../ports/index.js";

export class PostgresJccSubmissionJournal implements JccSubmissionJournal {
  constructor(
    private readonly database: JejakDatabase,
    private readonly actorContext: TransactionActorContext,
    private readonly options: { nextId?: () => string; now?: () => Date } = {},
  ) {}

  async begin(input: Parameters<JccSubmissionJournal["begin"]>[0]) {
    if (input.tenantId !== this.actorContext.tenantId) return { kind: "CONFLICT" as const };
    const now = this.options.now ?? (() => new Date());
    const nextId = this.options.nextId ?? uuidv7;
    return withTenantTransaction(this.database, this.actorContext, async (database) => {
      await database.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${input.tenantId}:${input.network}:${input.idempotencyKey}`}, 0))`);
      const [existing] = await database
        .select({
          envelopeHash: chainSubmissions.envelopeHash,
          id: chainSubmissions.id,
          ledgerSequence: chainSubmissions.ledgerSequence,
          operationId: chainSubmissions.operationId,
          status: chainSubmissions.status,
          transactionHash: chainSubmissions.transactionHash,
        })
        .from(chainSubmissions)
        .where(
          and(
            eq(chainSubmissions.tenantId, input.tenantId),
            eq(chainSubmissions.network, input.network),
            eq(chainSubmissions.idempotencyKey, input.idempotencyKey),
          ),
        )
        .limit(1);
      if (existing !== undefined) {
        if (existing.envelopeHash !== input.envelopeHash) return { kind: "CONFLICT" as const };
        if (existing.operationId === null) return { kind: "CONFLICT" as const };
        if (existing.transactionHash === null) {
          return { kind: "NEW" as const, operationId: existing.operationId, submissionId: existing.id };
        }
        return {
          kind: "REPLAY" as const,
          operationId: existing.operationId,
          reconciled: existing.status === "RECONCILED",
          submission: {
            submissionId: existing.id,
            attestationKey: input.attestationKey,
            envelopeHash: input.envelopeHash,
            transactionHash: existing.transactionHash,
            ...(existing.ledgerSequence === null ? {} : { ledgerSequence: existing.ledgerSequence }),
          },
        };
      }
      await database.insert(operations).values({
        id: input.operationId,
        tenantId: input.tenantId,
        kind: input.operationKind,
        status: "PREPARED",
        resourceType: "ELIGIBILITY_ATTESTATION",
        resourceId: input.attestationId,
        context: { envelopeHash: input.envelopeHash, network: input.network },
        createdAt: now(),
        updatedAt: now(),
      }).onConflictDoNothing();
      const [operation] = await database
        .select({
          kind: operations.kind,
          resourceId: operations.resourceId,
          tenantId: operations.tenantId,
        })
        .from(operations)
        .where(and(eq(operations.tenantId, input.tenantId), eq(operations.id, input.operationId)))
        .limit(1);
      if (
        operation === undefined ||
        operation.kind !== input.operationKind ||
        operation.resourceId !== input.attestationId
      ) {
        return { kind: "CONFLICT" as const };
      }
      const submissionId = nextId();
      await database.insert(chainSubmissions).values({
        id: submissionId,
        tenantId: input.tenantId,
        operationId: input.operationId,
        network: input.network,
        idempotencyKey: input.idempotencyKey,
        envelopeHash: input.envelopeHash,
        status: "PREPARED",
        createdAt: now(),
        updatedAt: now(),
      });
      return { kind: "NEW" as const, operationId: input.operationId, submissionId };
    });
  }

  async markSubmitted(input: Parameters<JccSubmissionJournal["markSubmitted"]>[0]): Promise<void> {
    const now = this.options.now ?? (() => new Date());
    await withTenantTransaction(this.database, this.actorContext, async (database) => {
      const [updated] = await database.update(chainSubmissions).set({
        transactionHash: input.transactionHash,
        ...(input.ledgerSequence === undefined ? {} : { ledgerSequence: input.ledgerSequence }),
        status: "SUBMITTED",
        updatedAt: now(),
      }).where(and(
        eq(chainSubmissions.tenantId, input.tenantId),
        eq(chainSubmissions.id, input.submissionId),
        eq(chainSubmissions.operationId, input.operationId),
        eq(chainSubmissions.envelopeHash, input.envelopeHash),
      )).returning({ id: chainSubmissions.id });
      if (updated === undefined) throw new Error("JCC chain submission identity is unavailable.");
      await database.update(operations).set({ status: "SUBMITTED", updatedAt: now() }).where(
        and(eq(operations.tenantId, input.tenantId), eq(operations.id, input.operationId)),
      );
    });
  }

  async markReconciled(input: Parameters<JccSubmissionJournal["markReconciled"]>[0]): Promise<void> {
    const now = this.options.now ?? (() => new Date());
    await withTenantTransaction(this.database, this.actorContext, async (database) => {
      const [updated] = await database
        .update(chainSubmissions)
        .set({ status: "RECONCILED", updatedAt: now() })
        .where(and(
          eq(chainSubmissions.tenantId, input.tenantId),
          eq(chainSubmissions.id, input.submissionId),
          eq(chainSubmissions.operationId, input.operationId),
        ))
        .returning({ id: chainSubmissions.id });
      if (updated === undefined) throw new Error("JCC reconciled submission is unavailable.");
      await database.update(operations).set({ status: "COMPLETED", updatedAt: now() }).where(
        and(eq(operations.tenantId, input.tenantId), eq(operations.id, input.operationId)),
      );
    });
  }

  async markFailed(input: Parameters<JccSubmissionJournal["markFailed"]>[0]): Promise<void> {
    const now = this.options.now ?? (() => new Date());
    await withTenantTransaction(this.database, this.actorContext, async (database) => {
      await database.update(operations).set({
        status: "FAILED",
        context: { safeErrorClass: input.safeErrorClass },
        updatedAt: now(),
      }).where(and(eq(operations.tenantId, input.tenantId), eq(operations.id, input.operationId)));
    });
  }
}
