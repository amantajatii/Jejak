import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";

import { AuthorizationError } from "../src/auth/authorization.js";
import type { ActiveMembership } from "../src/auth/membership-repository.js";
import {
  ClaimControlCommandService,
  registerControlDecisionRoutes,
  registerControlEvidenceRoutes,
  registerPauseRoutes,
  type ControlCommandRepository,
  type ControlRouteDependencies,
} from "../src/modules/control/index.js";
import { registerResolutionRoutes, ResolutionService, type ResolutionRepository } from "../src/modules/resolution/index.js";
import { DomainError } from "../src/modules/shared/errors.js";

const tenantId = "01980a12-3456-789a-8abc-def012345671";
const otherTenantId = "01980a12-3456-789a-8abc-def012345672";
const actorId = "01980a12-3456-789a-8abc-def012345673";
const membershipId = "01980a12-3456-789a-8abc-def012345674";
const grantId = "01980a12-3456-789a-8abc-def012345675";
const claimId = "01980a12-3456-789a-8abc-def012345676";
const headers = { authorization: "Bearer safe-test-token", "idempotency-key": "control-command-key-0001", "if-match": "7", "x-jejak-tenant-id": tenantId };

function membership(role: ActiveMembership["grants"][number]["role"]): ActiveMembership {
  return { actorId, grants: [{ grantId, role }], membershipId, tenantId };
}

function controlDependencies(role: ActiveMembership["grants"][number]["role"], repository: ControlCommandRepository): ControlRouteDependencies {
  return {
    findAssignments: vi.fn().mockResolvedValue([{ capability: role === "RESOLVER" ? "RESOLVE" : "OPERATE", resourceId: claimId, resourceType: "CLAIM" }]),
    findMembership: vi.fn().mockImplementation(async ({ tenantId: selected }) => selected === tenantId ? membership(role) : undefined),
    sandbox: true,
    service: new ClaimControlCommandService(repository),
    verifier: { verify: vi.fn().mockResolvedValue({ subject: actorId }) },
  };
}

function repository(): ControlCommandRepository {
  return {
    decide: vi.fn().mockResolvedValue({ claimId, createdAt: "2026-07-15T00:00:00Z", evidenceHash: "a".repeat(64), id: actorId, mode: "SANDBOX", reasonCodes: [], status: "VERIFIED", structure: "ASSIGNMENT", updatedAt: "2026-07-15T00:00:00Z", version: 2 }),
    pause: vi.fn().mockImplementation(async (input) => {
      if (input.expectedVersion !== 7) throw new DomainError("VERSION_CONFLICT", "Claim version does not match If-Match.");
      return { claimId, reasonCodes: input.reasonCodes, state: "PAUSED", version: 8 };
    }),
    submitEvidence: vi.fn().mockResolvedValue({ claimId, createdAt: "2026-07-15T00:00:00Z", evidenceHash: "a".repeat(64), id: actorId, mode: "SANDBOX", reasonCodes: [], status: "PENDING", structure: "ASSIGNMENT", updatedAt: "2026-07-15T00:00:00Z", version: 1 }),
  };
}

async function appWith(register: (app: ReturnType<typeof Fastify>) => Promise<void>) {
  const app = Fastify({ logger: false });
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AuthorizationError) return reply.code(403).send({ error: { code: error.code } });
    if (error instanceof DomainError) return reply.code(error.code === "VERSION_CONFLICT" ? 412 : 409).send({ error: { code: error.code } });
    return reply.code(400).send({ error: { code: "VALIDATION_FAILED" } });
  });
  await register(app);
  return app;
}

describe("control and pause registrars", () => {
  it("rejects wrong tenant, missing assignment, and unauthorized pause role", async () => {
    const repo = repository();
    const wrongTenantDeps = controlDependencies("ADMIN", repo);
    const wrongTenant = await appWith((app) => registerPauseRoutes(app, wrongTenantDeps));
    const wrong = await wrongTenant.inject({ headers: { ...headers, "x-jejak-tenant-id": otherTenantId }, method: "POST", payload: { reasonCodes: ["POLICY_LIMIT"] }, url: `/v1/claims/${claimId}/pause` });
    expect(wrong.statusCode).toBe(403);
    await wrongTenant.close();

    const missingDeps = controlDependencies("ADMIN", repo);
    vi.mocked(missingDeps.findAssignments).mockResolvedValue([]);
    const missing = await appWith((app) => registerPauseRoutes(app, missingDeps));
    const absent = await missing.inject({ headers, method: "POST", payload: { reasonCodes: ["POLICY_LIMIT"] }, url: `/v1/claims/${claimId}/pause` });
    expect(absent.statusCode).toBe(403);
    await missing.close();

    const unauthorized = await appWith((app) => registerPauseRoutes(app, controlDependencies("ORIGINATOR", repo)));
    const denied = await unauthorized.inject({ headers, method: "POST", payload: { reasonCodes: ["POLICY_LIMIT"] }, url: `/v1/claims/${claimId}/pause` });
    expect(denied.statusCode).toBe(403);
    await unauthorized.close();
  });

  it("maps stale If-Match to 412 and exposes registerable evidence/decision boundaries", async () => {
    const repo = repository();
    const pause = await appWith((app) => registerPauseRoutes(app, controlDependencies("ADMIN", repo)));
    const stale = await pause.inject({ headers: { ...headers, "if-match": "6" }, method: "POST", payload: { reasonCodes: ["POLICY_LIMIT"] }, url: `/v1/claims/${claimId}/pause` });
    expect(stale.statusCode).toBe(412);
    await pause.close();

    const evidence = await appWith((app) => registerControlEvidenceRoutes(app, controlDependencies("ORIGINATOR", repo)));
    expect((await evidence.inject({ headers, method: "POST", payload: { evidenceHash: "a".repeat(64), evidenceType: "ASSIGNMENT_NOTICE" }, url: `/v1/claims/${claimId}/control-evidence` })).statusCode).toBe(201);
    await evidence.close();
    const decision = await appWith((app) => registerControlDecisionRoutes(app, controlDependencies("ORIGINATOR", repo)));
    expect((await decision.inject({ headers, method: "POST", payload: { decision: "VERIFY", reasonCodes: [] }, url: `/v1/claims/${claimId}/control-decision` })).statusCode).toBe(200);
    await decision.close();
  });
});

describe("resolution registrar authorization", () => {
  it("rejects non-resolver and accepts an assigned resolver boundary", async () => {
    const repo: ResolutionRepository = {
      load: vi.fn().mockResolvedValue({ claimState: "SHORTFALL", claimVersion: 7 }),
      mutate: vi.fn().mockResolvedValue({ claimId, evidenceHashes: [], finalLoss: { amountMinor: "0", currency: "USDC", scale: 6 }, id: actorId, openedAt: "2026-07-15T00:00:00Z", openedReasonCodes: ["SETTLEMENT_SHORTFALL"], recoveryExpected: { amountMinor: "100", currency: "USDC", scale: 6 }, recoveryRealized: { amountMinor: "0", currency: "USDC", scale: 6 }, resolverAddress: "G".repeat(56), status: "OPEN", version: 1 }),
    };
    const service = new ResolutionService(repo, { isCloseReconciled: vi.fn().mockResolvedValue(false) });
    const deniedDeps = { ...controlDependencies("ORIGINATOR", repository()), service };
    const denied = await appWith((app) => registerResolutionRoutes(app, deniedDeps));
    expect((await denied.inject({ headers, method: "POST", payload: { action: "OPEN", reasonCodes: ["SETTLEMENT_SHORTFALL"] }, url: `/v1/claims/${claimId}/resolution` })).statusCode).toBe(403);
    await denied.close();
    const resolver = await appWith((app) => registerResolutionRoutes(app, { ...controlDependencies("RESOLVER", repository()), service }));
    expect((await resolver.inject({ headers, method: "POST", payload: { action: "OPEN", reasonCodes: ["SETTLEMENT_SHORTFALL"] }, url: `/v1/claims/${claimId}/resolution` })).statusCode).toBe(200);
    await resolver.close();
  });
});
