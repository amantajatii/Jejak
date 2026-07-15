import { and, eq, inArray, lt, or } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";

import type { JejakDatabase } from "../../../db/client.js";
import { withTenantTransaction, type TransactionActorContext } from "../../../db/context.js";
import { operationSteps, operations, partnerAttempts } from "../../../db/schema/reliability.js";
import type { RiskOperationJournal, RiskWorkClaim } from "../ports/durable-operation.js";

type OperationContext = {
  claimId?: unknown;
  settlementStreamId?: unknown;
  snapshotCutoffAt?: unknown;
};

function workFrom(row: {
  context: unknown;
  id: string;
  resourceId: string | null;
  tenantId: string;
}, attempt: number): RiskWorkClaim {
  const context = row.context as OperationContext;
  if (
    typeof context.claimId !== "string" ||
    typeof context.settlementStreamId !== "string" ||
    typeof context.snapshotCutoffAt !== "string" ||
    row.resourceId !== context.claimId
  ) {
    throw new Error("Persisted RISK operation context is malformed.");
  }
  return {
    kind: "CLAIMED",
    attempt,
    work: {
      claimId: context.claimId,
      operationId: row.id,
      settlementStreamId: context.settlementStreamId,
      snapshotCutoffAt: context.snapshotCutoffAt,
      tenantId: row.tenantId,
    },
  };
}

export class PostgresRiskOperationJournal implements RiskOperationJournal {
  constructor(
    private readonly database: JejakDatabase,
    private readonly actorContext: TransactionActorContext,
    private readonly options: { nextId?: () => string; now?: () => Date } = {},
  ) {}

  async claim(input: { operationId: string; staleBefore: Date; tenantId: string }): Promise<RiskWorkClaim> {
    if (input.tenantId !== this.actorContext.tenantId) return { kind: "NOT_FOUND" };
    const now = this.options.now ?? (() => new Date());
    return withTenantTransaction(this.database, this.actorContext, async (database) => {
      const [row] = await database
        .update(operations)
        .set({ status: "RUNNING", updatedAt: now() })
        .where(
          and(
            eq(operations.tenantId, input.tenantId),
            eq(operations.id, input.operationId),
            eq(operations.kind, "RISK_EVALUATION"),
            or(
              inArray(operations.status, ["QUEUED", "RETRYABLE"]),
              and(eq(operations.status, "RUNNING"), lt(operations.updatedAt, input.staleBefore)),
            ),
          ),
        )
        .returning({
          context: operations.context,
          id: operations.id,
          resourceId: operations.resourceId,
          tenantId: operations.tenantId,
        });
      if (row !== undefined) {
        const priorAttempts = await database
          .select({ id: partnerAttempts.id })
          .from(partnerAttempts)
          .where(and(
            eq(partnerAttempts.tenantId, input.tenantId),
            eq(partnerAttempts.operationId, input.operationId),
            eq(partnerAttempts.partner, "RISK"),
            eq(partnerAttempts.operation, "EVALUATE"),
          ));
        await database.insert(operationSteps).values({
          id: (this.options.nextId ?? uuidv7)(),
          tenantId: input.tenantId,
          operationId: input.operationId,
          name: "RISK_EVALUATION",
          status: "RUNNING",
          attemptCount: 1,
          safeResult: {},
          createdAt: now(),
          updatedAt: now(),
        });
        return workFrom(row, priorAttempts.length);
      }
      const [existing] = await database
        .select({ status: operations.status })
        .from(operations)
        .where(
          and(
            eq(operations.tenantId, input.tenantId),
            eq(operations.id, input.operationId),
            eq(operations.kind, "RISK_EVALUATION"),
          ),
        )
        .limit(1);
      if (existing === undefined) return { kind: "NOT_FOUND" };
      return { kind: existing.status === "COMPLETED" ? "COMPLETED" : "BUSY" };
    });
  }

  async recordAttempt(input: Parameters<RiskOperationJournal["recordAttempt"]>[0]): Promise<void> {
    if (input.tenantId !== this.actorContext.tenantId) return;
    const now = this.options.now ?? (() => new Date());
    await withTenantTransaction(this.database, this.actorContext, async (database) => {
      await database.insert(partnerAttempts).values({
        id: (this.options.nextId ?? uuidv7)(),
        tenantId: input.tenantId,
        operationId: input.operationId,
        partner: "RISK",
        operation: "EVALUATE",
        requestHash: input.requestHash,
        status: input.status,
        ...(input.safeErrorClass === undefined ? {} : { safeErrorClass: input.safeErrorClass }),
        startedAt: now(),
        completedAt: now(),
      });
    });
  }

  async markFailed(input: Parameters<RiskOperationJournal["markFailed"]>[0]): Promise<void> {
    if (input.tenantId !== this.actorContext.tenantId) return;
    const now = this.options.now ?? (() => new Date());
    await withTenantTransaction(this.database, this.actorContext, async (database) => {
      await database
        .update(operations)
        .set({ status: input.retryable ? "RETRYABLE" : "FAILED", updatedAt: now() })
        .where(and(eq(operations.tenantId, input.tenantId), eq(operations.id, input.operationId)));
      await database.insert(operationSteps).values({
        id: (this.options.nextId ?? uuidv7)(),
        tenantId: input.tenantId,
        operationId: input.operationId,
        name: "RISK_EVALUATION",
        status: input.retryable ? "RETRYABLE" : "FAILED",
        attemptCount: 1,
        safeResult: { errorClass: input.safeErrorClass },
        createdAt: now(),
        updatedAt: now(),
      });
    });
  }

  async markCompleted(input: Parameters<RiskOperationJournal["markCompleted"]>[0]): Promise<void> {
    if (input.tenantId !== this.actorContext.tenantId) return;
    const now = this.options.now ?? (() => new Date());
    await withTenantTransaction(this.database, this.actorContext, async (database) => {
      await database
        .update(operations)
        .set({ status: "COMPLETED", updatedAt: now() })
        .where(and(
          eq(operations.tenantId, input.tenantId),
          eq(operations.id, input.operationId),
          eq(operations.kind, "RISK_EVALUATION"),
        ));
    });
  }
}
