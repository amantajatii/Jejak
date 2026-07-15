import Fastify from "fastify";
import { describe, expect, it } from "vitest";

import type { ActiveMembership } from "../src/auth/membership-repository.js";
import { AuthorizationError } from "../src/auth/authorization.js";
import { ReadModelService } from "../src/modules/read-model/application/read-service.js";
import type { AuditFilters, ReadModelRepository, SafeAuditEvent } from "../src/modules/read-model/ports/read-model-repository.js";
import { registerReadModelRoutes } from "../src/routes/read-models.js";

const tenantId = "01980a12-3456-789a-8abc-def012345678";
const actorId = "01980a12-3456-789a-8abc-def012345679";
const membershipId = "01980a12-3456-789a-8abc-def012345680";
const grantId = "01980a12-3456-789a-8abc-def012345681";

class ReadRepository implements ReadModelRepository {
  auditRows: Array<SafeAuditEvent & Record<string, unknown>> = [];
  lastFilters?: AuditFilters;
  async getPortfolio() {
    return {
      checkpointUpdatedAt: new Date("2026-07-15T12:00:00Z"),
      mismatchedSubmissions: 1,
      money: [{
        approvedPrincipalBaseUnits: "99999999999999999999999999999999999999",
        currency: "JUSD",
        financingFeePaidBaseUnits: "2",
        firstLossConsumedBaseUnits: "3",
        firstLossFundedBaseUnits: "10",
        issuedBaseUnits: "64",
        issuer: "GISSUER",
        outstandingPrincipalBaseUnits: "4",
        principalBaseUnits: "64",
        repaidBaseUnits: "60",
        scale: 7,
        seniorLossBaseUnits: "1",
        servicingFeePaidBaseUnits: "1",
        settlementBaseUnits: "63",
      }],
      pendingSubmissions: 2,
      states: [{ count: 1, state: "SHORTFALL" }],
    };
  }
  async listAuditEvents(input: { filters: AuditFilters }) { this.lastFilters = input.filters; return this.auditRows; }
}

function audit(id: string, createdAt: string): SafeAuditEvent & Record<string, unknown> {
  return {
    action: "claim.transitioned",
    actorId,
    createdAt: new Date(createdAt),
    id,
    idempotencyKey: "private-replay-token",
    privatePayload: { rawEvidence: "secret" },
    references: { signedUrl: "https://private.example/token", token: "secret" },
    requestId: actorId,
    resourceType: "CLAIM",
    result: "SUCCESS",
  };
}

describe("BE-16 read service", () => {
  it("returns exact integer Money with explicit unit metadata from database projection", async () => {
    const service = new ReadModelService(new ReadRepository());
    const result = await service.portfolio({ requestId: actorId, tenantId });
    expect(result.exposures[0]?.approvedPrincipal).toEqual({
      amountMinor: "99999999999999999999999999999999999999",
      currency: "JUSD",
      issuer: "GISSUER",
      scale: 7,
    });
    expect(result.reconciliation).toEqual({ mismatchedSubmissions: 1, pendingSubmissions: 2 });
  });

  it("uses a stable bounded keyset cursor and allowlisted audit response", async () => {
    const repository = new ReadRepository();
    repository.auditRows = [
      audit("01980a12-3456-789a-8abc-def012345682", "2026-07-15T12:00:02Z"),
      audit("01980a12-3456-789a-8abc-def012345683", "2026-07-15T12:00:01Z"),
    ];
    const service = new ReadModelService(repository);
    const first = await service.audit({ query: { action: "claim.transitioned", limit: 1 }, requestId: actorId, tenantId });
    expect(first.nextCursor).toBeTypeOf("string");
    expect(JSON.stringify(first)).not.toMatch(/idempotencyKey|rawEvidence|signedUrl|privatePayload|token|references/);
    await service.audit({ query: { cursor: first.nextCursor!, limit: 100 }, requestId: actorId, tenantId });
    expect(repository.lastFilters?.cursor).toEqual({
      createdAt: new Date("2026-07-15T12:00:02Z"),
      id: "01980a12-3456-789a-8abc-def012345682",
    });
    await expect(service.audit({ query: { limit: 101 }, requestId: actorId, tenantId })).rejects.toThrow();
    await expect(service.audit({ query: { action: "x'; drop table audit_events;--" }, requestId: actorId, tenantId })).rejects.toThrow();
  });
});

function membership(role: ActiveMembership["grants"][number]["role"]): ActiveMembership {
  return { actorId, grants: [{ grantId, role }], membershipId, tenantId };
}

describe("read route registrar institutional RBAC", () => {
  it("exports uncomposed portfolio/audit routes and enforces role separation", async () => {
    const repository = new ReadRepository();
    const app = Fastify();
    app.setErrorHandler((error, _request, reply) => reply.code(error instanceof AuthorizationError ? 403 : 400).send({
      error: error instanceof Error ? error.message : "request failed",
    }));
    let active = membership("FACILITY");
    await registerReadModelRoutes(app, {
      findMembership: async () => active,
      service: new ReadModelService(repository),
      verifier: { verify: async () => ({ subject: actorId }) },
    });
    const headers = { authorization: "Bearer test", "x-jejak-tenant-id": tenantId };
    await expect(app.inject({ headers, method: "GET", url: "/v1/portfolio/summary" })).resolves.toMatchObject({ statusCode: 200 });
    await expect(app.inject({ headers, method: "GET", url: "/v1/audit-events" })).resolves.toMatchObject({ statusCode: 403 });
    active = membership("ADMIN");
    await expect(app.inject({ headers, method: "GET", url: "/v1/audit-events" })).resolves.toMatchObject({ statusCode: 200 });
    await expect(app.inject({ headers, method: "GET", url: "/v1/portfolio/summary" })).resolves.toMatchObject({ statusCode: 403 });
    await app.close();
  });
});
