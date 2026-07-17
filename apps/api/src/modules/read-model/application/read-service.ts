import { z } from "zod";

import type { MoneyValue } from "../../shared/money.js";
import { validationError } from "../../shared/errors.js";
import type { AuditFilters, ReadModelRepository, SafeAuditEvent } from "../ports/read-model-repository.js";

const cursorSchema = z.object({ createdAt: z.iso.datetime(), id: z.uuid(), v: z.literal(1) }).strict();

export type AuditQuery = {
  action?: string;
  cursor?: string;
  from?: string;
  limit?: number;
  resourceType?: string;
  result?: "FAILURE" | "SUCCESS";
  to?: string;
};

export class ReadModelService {
  constructor(private readonly repository: ReadModelRepository) {}

  async portfolio(input: { requestId: string; tenantId: string }) {
    const projection = await this.repository.getPortfolio(input);
    return {
      asOf: timestampIso(projection.checkpointUpdatedAt),
      exposures: projection.money.map((row) => ({
        approvedPrincipal: money(row.approvedPrincipalBaseUnits, row),
        financingFeePaid: money(row.financingFeePaidBaseUnits, row),
        firstLossConsumed: money(row.firstLossConsumedBaseUnits, row),
        firstLossFunded: money(row.firstLossFundedBaseUnits, row),
        issued: money(row.issuedBaseUnits, row),
        outstandingPrincipal: money(row.outstandingPrincipalBaseUnits, row),
        principal: money(row.principalBaseUnits, row),
        repaid: money(row.repaidBaseUnits, row),
        seniorLoss: money(row.seniorLossBaseUnits, row),
        servicingFeePaid: money(row.servicingFeePaidBaseUnits, row),
        settlement: money(row.settlementBaseUnits, row),
      })),
      positionsByState: projection.states,
      reconciliation: {
        mismatchedSubmissions: projection.mismatchedSubmissions,
        pendingSubmissions: projection.pendingSubmissions,
      },
    };
  }

  async audit(input: { query: AuditQuery; requestId: string; tenantId: string }) {
    const filters = auditFilters(input.query);
    const rows = await this.repository.listAuditEvents({ filters, requestId: input.requestId, tenantId: input.tenantId });
    const hasNext = rows.length > filters.limit;
    const page = rows.slice(0, filters.limit);
    const last = page.at(-1);
    return {
      data: page.map(safeAuditView),
      ...(hasNext && last !== undefined ? { nextCursor: encodeCursor(last) } : {}),
    };
  }
}

function timestampIso(value: Date | string | undefined): string {
  const date = value === undefined ? new Date(0) : value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.valueOf()) ? new Date(0).toISOString() : date.toISOString();
}

export function auditFilters(query: AuditQuery): AuditFilters {
  const result = z.object({
    action: z.string().regex(/^[a-z0-9._-]{1,100}$/i).optional(),
    cursor: z.string().min(1).max(512).optional(),
    from: z.iso.datetime().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    resourceType: z.string().regex(/^[A-Z0-9_]{1,64}$/).optional(),
    result: z.enum(["FAILURE", "SUCCESS"]).optional(),
    to: z.iso.datetime().optional(),
  }).strict().safeParse(query);
  if (!result.success) validationError("Audit filters are invalid.");
  const parsed = result.data;
  const from = parsed.from === undefined ? undefined : new Date(parsed.from);
  const to = parsed.to === undefined ? undefined : new Date(parsed.to);
  if (from !== undefined && to !== undefined && from > to) validationError("Audit from must not be after to.");
  return {
    ...(parsed.action === undefined ? {} : { action: parsed.action }),
    ...(parsed.cursor === undefined ? {} : { cursor: decodeCursor(parsed.cursor) }),
    ...(from === undefined ? {} : { from }),
    limit: parsed.limit,
    ...(parsed.resourceType === undefined ? {} : { resourceType: parsed.resourceType }),
    ...(parsed.result === undefined ? {} : { result: parsed.result }),
    ...(to === undefined ? {} : { to }),
  };
}

function money(amountMinor: string, unit: { currency: string; issuer?: string; scale: number }): MoneyValue {
  return {
    amountMinor,
    currency: unit.currency,
    ...(unit.issuer === undefined ? {} : { issuer: unit.issuer }),
    scale: unit.scale,
  };
}

function safeAuditView(event: SafeAuditEvent) {
  return {
    action: event.action,
    actorId: event.actorId,
    ...(event.afterVersion === undefined ? {} : { afterVersion: event.afterVersion }),
    ...(event.beforeVersion === undefined ? {} : { beforeVersion: event.beforeVersion }),
    ...(event.correlationId === undefined ? {} : { correlationId: event.correlationId }),
    createdAt: event.createdAt.toISOString(),
    id: event.id,
    ...(event.membershipId === undefined ? {} : { membershipId: event.membershipId }),
    ...(event.payloadHash === undefined ? {} : { payloadHash: event.payloadHash }),
    ...(event.reasonCode === undefined ? {} : { reasonCode: event.reasonCode }),
    requestId: event.requestId,
    ...(event.resourceId === undefined ? {} : { resourceId: event.resourceId }),
    resourceType: event.resourceType,
    result: event.result,
    ...(event.roleGrantId === undefined ? {} : { roleGrantId: event.roleGrantId }),
  };
}

function encodeCursor(event: Pick<SafeAuditEvent, "createdAt" | "id">): string {
  return Buffer.from(JSON.stringify({ createdAt: event.createdAt.toISOString(), id: event.id, v: 1 }), "utf8").toString("base64url");
}

function decodeCursor(cursor: string) {
  try {
    const parsed = cursorSchema.parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
    return { createdAt: new Date(parsed.createdAt), id: parsed.id };
  } catch {
    validationError("Audit cursor is invalid.");
  }
}
