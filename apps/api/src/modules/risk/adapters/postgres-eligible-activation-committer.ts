import { and, eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";

import type { JejakDatabase } from "../../../db/client.js";
import { withTenantTransaction, type TransactionActorContext } from "../../../db/context.js";
import { auditEvents, operations, outboxEvents } from "../../../db/schema/reliability.js";
import { canonicalHash } from "../../../reliability/canonical-json.js";
import { PostgresClaimRepository } from "../../claims/adapters/postgres-repository.js";
import { applyRiskDecision } from "../../claims/domain/lifecycle.js";
import type { EligibleRiskActivationCommitter } from "../ports/durable-operation.js";

export class PostgresEligibleRiskActivationCommitter implements EligibleRiskActivationCommitter {
  constructor(
    private readonly database: JejakDatabase,
    private readonly actorContext: TransactionActorContext,
    private readonly options: { nextId?: () => string; now?: () => Date } = {},
  ) {}

  async activate(input: Parameters<EligibleRiskActivationCommitter["activate"]>[0]): Promise<void> {
    if (input.tenantId !== this.actorContext.tenantId) throw new Error("JCC activation tenant mismatch.");
    const now = this.options.now ?? (() => new Date());
    const nextId = this.options.nextId ?? uuidv7;
    await withTenantTransaction(this.database, this.actorContext, async (database) => {
      const repository = new PostgresClaimRepository(database);
      const claim = await repository.findById(input.tenantId, input.evaluation.claimId);
      if (claim === null) throw new Error("Claim is unavailable for JCC activation.");
      if (claim.state === "ELIGIBLE") {
        await database.update(operations).set({ status: "COMPLETED", updatedAt: now() }).where(and(
          eq(operations.tenantId, input.tenantId), eq(operations.id, input.operationId),
        ));
        return;
      }
      const transition = applyRiskDecision(claim, {
        expectedVersion: input.claimExpectedVersion,
        decision: "ELIGIBLE",
        eligibleSettlementValue: input.evaluation.eligibleSettlementValue,
        maxAdvanceAmount: input.evaluation.maxAdvanceAmount,
        reasonCodes: input.evaluation.effectiveReasonCodes,
        blocksAutomation: false,
        now: now().toISOString(),
      });
      await repository.update(transition.claim, input.claimExpectedVersion);
      const payloadHash = canonicalHash({ evaluationId: input.evaluation.evaluationId, state: "ELIGIBLE" });
      await database.insert(auditEvents).values({
        id: nextId(), tenantId: input.tenantId, actorId: this.actorContext.actorId,
        requestId: this.actorContext.requestId, action: "claim.analysis.completed",
        resourceType: "CLAIM", resourceId: claim.id, beforeVersion: claim.version,
        afterVersion: transition.claim.version, payloadHash, result: "SUCCESS",
        references: { evaluationId: input.evaluation.evaluationId, operationId: input.operationId }, createdAt: now(),
      });
      await database.insert(outboxEvents).values({
        id: nextId(), tenantId: input.tenantId, aggregateType: "CLAIM", aggregateId: claim.id,
        aggregateVersion: transition.claim.version, eventType: "claim.analysis.completed", eventVersion: 1,
        idempotencyKey: `risk-active:${input.operationId}`,
        payload: { claimId: claim.id, decision: "ELIGIBLE", evaluationId: input.evaluation.evaluationId },
        createdAt: now(), nextAttemptAt: now(),
      }).onConflictDoNothing();
      await database.update(operations).set({ status: "COMPLETED", updatedAt: now() }).where(and(
        eq(operations.tenantId, input.tenantId), eq(operations.id, input.operationId),
      ));
    });
  }
}
