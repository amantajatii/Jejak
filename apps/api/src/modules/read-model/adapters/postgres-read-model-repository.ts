import { and, desc, eq, gte, inArray, lt, lte, or, sql } from "drizzle-orm";

import type { JejakDatabase } from "../../../db/client.js";
import { applyTransactionContext } from "../../../db/context.js";
import {
  auditEvents,
  chainEventCheckpoints,
  chainPortfolioPositions,
  chainReconciliationResults,
  chainSubmissions,
} from "../../../db/schema/index.js";
import type { AuditFilters, PortfolioMoneyRow, ReadModelRepository, SafeAuditEvent } from "../ports/read-model-repository.js";

export class PostgresReadModelRepository implements ReadModelRepository {
  constructor(private readonly database: JejakDatabase, private readonly actorId: string) {}

  async getPortfolio(input: { requestId: string; tenantId: string }) {
    return this.database.transaction(async (transaction) => {
      const database = transaction as JejakDatabase;
      await applyTransactionContext(database, { actorId: this.actorId, requestId: input.requestId, tenantId: input.tenantId });
      const money = await database.select({
        approvedPrincipalBaseUnits: sum(chainPortfolioPositions.approvedPrincipalBaseUnits),
        currency: chainPortfolioPositions.currency,
        financingFeePaidBaseUnits: sum(chainPortfolioPositions.financingFeePaidBaseUnits),
        firstLossConsumedBaseUnits: sum(chainPortfolioPositions.firstLossConsumedBaseUnits),
        firstLossFundedBaseUnits: sum(chainPortfolioPositions.firstLossFundedBaseUnits),
        issuedBaseUnits: sum(chainPortfolioPositions.issuedBaseUnits),
        issuer: chainPortfolioPositions.issuer,
        outstandingPrincipalBaseUnits: sum(chainPortfolioPositions.outstandingPrincipalBaseUnits),
        principalBaseUnits: sum(chainPortfolioPositions.principalBaseUnits),
        repaidBaseUnits: sum(chainPortfolioPositions.repaidBaseUnits),
        scale: chainPortfolioPositions.scale,
        seniorLossBaseUnits: sum(chainPortfolioPositions.seniorLossBaseUnits),
        servicingFeePaidBaseUnits: sum(chainPortfolioPositions.servicingFeePaidBaseUnits),
        settlementBaseUnits: sum(chainPortfolioPositions.settlementBaseUnits),
      }).from(chainPortfolioPositions).where(eq(chainPortfolioPositions.tenantId, input.tenantId)).groupBy(
        chainPortfolioPositions.currency,
        chainPortfolioPositions.scale,
        chainPortfolioPositions.issuer,
      ).orderBy(chainPortfolioPositions.currency, chainPortfolioPositions.scale, chainPortfolioPositions.issuer);
      const states = await database.select({ count: sql<number>`count(*)::integer`, state: chainPortfolioPositions.state })
        .from(chainPortfolioPositions)
        .where(eq(chainPortfolioPositions.tenantId, input.tenantId))
        .groupBy(chainPortfolioPositions.state)
        .orderBy(chainPortfolioPositions.state);
      const [pending] = await database.select({ count: sql<number>`count(*)::integer` }).from(chainSubmissions).where(and(
        eq(chainSubmissions.tenantId, input.tenantId),
        inArray(chainSubmissions.status, ["SUBMITTED", "CHAIN_SUCCESS_PENDING_RECONCILIATION"]),
      ));
      const [mismatched] = await database.select({ count: sql<number>`count(distinct ${chainReconciliationResults.expectationId})::integer` })
        .from(chainReconciliationResults)
        .where(and(
          eq(chainReconciliationResults.tenantId, input.tenantId),
          eq(chainReconciliationResults.outcome, "MISMATCH"),
        ));
      const [checkpoint] = await database.select({
        count: sql<number>`count(distinct ${chainEventCheckpoints.contractId})::integer`,
        updatedAt: sql<Date>`min(${chainEventCheckpoints.updatedAt})`,
      })
        .from(chainEventCheckpoints)
        .where(eq(chainEventCheckpoints.tenantId, input.tenantId));
      return {
        ...(checkpoint?.count !== 6 || checkpoint.updatedAt === null || checkpoint.updatedAt === undefined ? {} : { checkpointUpdatedAt: checkpoint.updatedAt }),
        mismatchedSubmissions: mismatched?.count ?? 0,
        money: money.map((row) => ({ ...row, ...(row.issuer === null ? { issuer: undefined } : {}) })) as PortfolioMoneyRow[],
        pendingSubmissions: pending?.count ?? 0,
        states,
      };
    });
  }

  async listAuditEvents(input: { filters: AuditFilters; requestId: string; tenantId: string }): Promise<SafeAuditEvent[]> {
    return this.database.transaction(async (transaction) => {
      const database = transaction as JejakDatabase;
      await applyTransactionContext(database, { actorId: this.actorId, requestId: input.requestId, tenantId: input.tenantId });
      const filters = input.filters;
      const cursor = filters.cursor;
      const conditions = [
        eq(auditEvents.tenantId, input.tenantId),
        ...(filters.action === undefined ? [] : [eq(auditEvents.action, filters.action)]),
        ...(filters.resourceType === undefined ? [] : [eq(auditEvents.resourceType, filters.resourceType)]),
        ...(filters.result === undefined ? [] : [eq(auditEvents.result, filters.result)]),
        ...(filters.from === undefined ? [] : [gte(auditEvents.createdAt, filters.from)]),
        ...(filters.to === undefined ? [] : [lte(auditEvents.createdAt, filters.to)]),
        ...(cursor === undefined ? [] : [or(
          lt(auditEvents.createdAt, cursor.createdAt),
          and(eq(auditEvents.createdAt, cursor.createdAt), lt(auditEvents.id, cursor.id)),
        )!]),
      ];
      const rows = await database.select({
        action: auditEvents.action,
        actorId: auditEvents.actorId,
        afterVersion: auditEvents.afterVersion,
        beforeVersion: auditEvents.beforeVersion,
        correlationId: auditEvents.correlationId,
        createdAt: auditEvents.createdAt,
        id: auditEvents.id,
        membershipId: auditEvents.membershipId,
        payloadHash: auditEvents.payloadHash,
        reasonCode: auditEvents.reasonCode,
        requestId: auditEvents.requestId,
        resourceId: auditEvents.resourceId,
        resourceType: auditEvents.resourceType,
        result: auditEvents.result,
        roleGrantId: auditEvents.roleGrantId,
      }).from(auditEvents).where(and(...conditions)).orderBy(desc(auditEvents.createdAt), desc(auditEvents.id)).limit(filters.limit + 1);
      return rows.map((row) => compact(row));
    });
  }
}

const sum = (column: typeof chainPortfolioPositions.approvedPrincipalBaseUnits) => sql<string>`coalesce(sum(${column}), 0)::text`;

function compact(row: Record<string, unknown>): SafeAuditEvent {
  return Object.fromEntries(Object.entries(row).filter(([, value]) => value !== null)) as SafeAuditEvent;
}
