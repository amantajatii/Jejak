import { and, desc, eq, inArray } from "drizzle-orm";

import type { JejakDatabase } from "../../../db/client.js";
import { withTenantTransaction, type TransactionActorContext } from "../../../db/context.js";
import { operations } from "../../../db/schema/reliability.js";
import type { RiskJccPendingOperation, RiskJccPendingProjection } from "../ports/pending-projection.js";

export function projectRiskJccPendingOperation(row: {
  context: unknown;
  createdAt: Date;
  id: string;
  kind: string;
  status: string;
  updatedAt: Date;
}): RiskJccPendingOperation | null {
  if (row.status === "COMPLETED") return null;
  const safeErrorClass = (row.context as { safeErrorClass?: unknown }).safeErrorClass;
  const reasonCodes: RiskJccPendingOperation["reasonCodes"] =
    safeErrorClass === "PARTNER_TIMEOUT" ? ["PARTNER_UNAVAILABLE"] :
      typeof safeErrorClass === "string" ? ["DATA_INCONSISTENT"] : [];
  const status = row.status === "QUEUED" ? "QUEUED" :
    row.status === "RUNNING" ? "PROCESSING" :
      row.status === "PREPARED" || row.status === "SUBMITTED" ? "AWAITING_CHAIN_RECONCILIATION" :
        row.status === "RETRYABLE" ? "RETRYABLE_FAILURE" : "TERMINAL_FAILURE";
  return {
    id: row.id,
    kind: row.kind === "RISK_EVALUATION" ? "RISK_EVALUATION" : "JCC_REGISTRATION",
    status,
    retryable: row.status === "QUEUED" || row.status === "RUNNING" || row.status === "PREPARED" ||
      row.status === "SUBMITTED" || row.status === "RETRYABLE",
    reasonCodes,
    submittedAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export class PostgresRiskJccPendingProjection implements RiskJccPendingProjection {
  constructor(
    private readonly database: JejakDatabase,
    private readonly actorContext: TransactionActorContext,
  ) {}

  async latest(input: { claimId: string; tenantId: string }) {
    if (input.tenantId !== this.actorContext.tenantId) return null;
    return withTenantTransaction(this.database, this.actorContext, async (database) => {
      const [row] = await database.select({
        context: operations.context, createdAt: operations.createdAt, id: operations.id,
        kind: operations.kind, status: operations.status, updatedAt: operations.updatedAt,
      }).from(operations).where(and(
        eq(operations.tenantId, input.tenantId),
        eq(operations.resourceId, input.claimId),
        inArray(operations.kind, ["RISK_EVALUATION", "JCC_REGISTER"]),
      )).orderBy(desc(operations.updatedAt), desc(operations.createdAt)).limit(1);
      return row === undefined ? null : projectRiskJccPendingOperation(row);
    });
  }
}
