import { and, asc, eq, inArray, lt, or } from "drizzle-orm";

import type { JejakDatabase } from "../../../db/client.js";
import { withTenantTransaction, type TransactionActorContext } from "../../../db/context.js";
import { operations } from "../../../db/schema/reliability.js";
import type { RiskEvaluationWorkerService } from "./risk-evaluation-worker.js";

export interface RiskWorkQueue {
  listCandidates(input: { limit: number; staleBefore: Date; tenantId: string }): Promise<string[]>;
}

export class PostgresRiskWorkQueue implements RiskWorkQueue {
  constructor(
    private readonly database: JejakDatabase,
    private readonly actorContext: TransactionActorContext,
  ) {}

  listCandidates(input: { limit: number; staleBefore: Date; tenantId: string }): Promise<string[]> {
    if (input.tenantId !== this.actorContext.tenantId) return Promise.resolve([]);
    return withTenantTransaction(this.database, this.actorContext, async (database) => {
      const rows = await database
        .select({ id: operations.id })
        .from(operations)
        .where(and(
          eq(operations.tenantId, input.tenantId),
          eq(operations.kind, "RISK_EVALUATION"),
          or(
            inArray(operations.status, ["QUEUED", "RETRYABLE"]),
            and(eq(operations.status, "RUNNING"), lt(operations.updatedAt, input.staleBefore)),
          ),
        ))
        .orderBy(asc(operations.createdAt), asc(operations.id))
        .limit(input.limit);
      return rows.map((row) => row.id);
    });
  }
}

export type RiskWorkerRunSummary = {
  attempted: number;
  failed: number;
  succeeded: number;
};

export class RiskWorkerRuntime {
  constructor(
    private readonly dependencies: {
      queue: RiskWorkQueue;
      workerFor(requestId: string): RiskEvaluationWorkerService;
    },
    private readonly options: {
      batchSize?: number;
      leaseMs?: number;
      now?: () => Date;
      pollMs?: number;
      sleep?: (milliseconds: number) => Promise<void>;
    } = {},
  ) {}

  async runOnce(tenantId: string): Promise<RiskWorkerRunSummary> {
    const now = this.options.now ?? (() => new Date());
    const operationIds = await this.dependencies.queue.listCandidates({
      limit: this.options.batchSize ?? 10,
      staleBefore: new Date(now().valueOf() - (this.options.leaseMs ?? 60_000)),
      tenantId,
    });
    const summary: RiskWorkerRunSummary = { attempted: operationIds.length, failed: 0, succeeded: 0 };
    for (const operationId of operationIds) {
      try {
        const result = await this.dependencies.workerFor(operationId).run({ operationId, tenantId });
        if (result.status === "SUCCEEDED" || result.status === "COMPLETED") summary.succeeded += 1;
      } catch {
        summary.failed += 1;
      }
    }
    return summary;
  }

  async runUntilAborted(tenantId: string, signal: AbortSignal): Promise<void> {
    const sleep = this.options.sleep ?? ((milliseconds: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
    while (!signal.aborted) {
      await this.runOnce(tenantId);
      if (!signal.aborted) await sleep(this.options.pollMs ?? 1_000);
    }
  }
}
