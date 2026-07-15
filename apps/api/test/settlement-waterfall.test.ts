import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";

import { AuthorizationError } from "../src/auth/authorization.js";
import type { ActiveMembership } from "../src/auth/membership-repository.js";
import { DeterministicWaterfallSubmitter } from "../src/modules/settlement/adapters/deterministic-waterfall-submitter.js";
import { GeneratedWaterfallSubmitter } from "../src/modules/settlement/adapters/generated-waterfall-submitter.js";
import { createRuntimeWaterfallSubmitter } from "../src/modules/settlement/adapters/runtime-waterfall-submitter.js";
import { InMemorySettlementJournal } from "../src/modules/settlement/adapters/in-memory-settlement-journal.js";
import { ChainSettlementReconciliationBridge } from "../src/modules/settlement/adapters/chain-reconciliation-bridge.js";
import { SettlementService } from "../src/modules/settlement/application/settlement-service.js";
import { calculateWaterfall, SettlementProtocolError } from "../src/modules/settlement/domain/settlement.js";
import type { SettlementContext, WaterfallSubmissionPort } from "../src/modules/settlement/ports/settlement.js";
import { WaterfallSubmissionError } from "../src/modules/settlement/ports/settlement.js";
import { registerSettlementRoutes } from "../src/modules/settlement/routes.js";

const tenantId = "01980a12-3456-789a-8abc-def012345678";
const otherTenantId = "01980a12-3456-789a-8abc-def012345699";
const actorId = "01980a12-3456-789a-8abc-def012345679";
const membershipId = "01980a12-3456-789a-8abc-def012345680";
const roleGrantId = "01980a12-3456-789a-8abc-def012345681";
const claimId = "01980a12-3456-789a-8abc-def012345682";
const settlementEventId = "01980a12-3456-789a-8abc-def012345683";
const claimKey = "a".repeat(64);
const issuer = `G${"A".repeat(55)}`;
const servicerAddress = `G${"B".repeat(55)}`;
const money = (amountMinor: string) => ({ amountMinor, currency: "JUSD", issuer, scale: 7 });
const position = {
  claimId,
  claimKey,
  firstLossConsumed: money("0"),
  firstLossFunded: money("10"),
  outstandingPrincipal: money("64"),
  state: "FUNDED",
};
const context: SettlementContext = {
  actorId,
  actorRole: "SERVICER",
  idempotencyKey: "settlement-idempotency-0001",
  membershipId,
  requestId: "01980a12-3456-789a-8abc-def012345684",
  roleGrantId,
  tenantId,
};

function settlementInput(overrides = {}) {
  return {
    amount: money("10"),
    claimId,
    eventType: "SETTLEMENT" as const,
    externalEventId: "marketplace-payout-1",
    occurredAt: "2026-07-15T12:00:00.000Z",
    source: "MARKETPLACE_SANDBOX",
    sourceHash: "1".repeat(64),
    ...overrides,
  };
}

describe("BE-14 exact waterfall", () => {
  it("allocates servicing fee, principal, financing fee, then residual", () => {
    const result = calculateWaterfall({
      finalSettlement: true,
      financingFeeDue: money("3"),
      position: { ...position, outstandingPrincipal: money("60") },
      servicingFeeDue: money("5"),
      settlement: money("70"),
      settlementEventId,
    });
    expect(result).toMatchObject({
      expectedClaimState: "REPAID",
      financingFeePaid: { amountMinor: "3" },
      firstLossApplied: { amountMinor: "0" },
      principalPaid: { amountMinor: "60" },
      sellerResidual: { amountMinor: "2" },
      seniorLoss: { amountMinor: "0" },
      servicingFeePaid: { amountMinor: "5" },
    });
    expect(result.resultHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("keeps partial settlement in SETTLING while applying funded first loss", () => {
    const result = calculateWaterfall({
      finalSettlement: false,
      financingFeeDue: money("3"),
      position,
      servicingFeeDue: money("2"),
      settlement: money("10"),
      settlementEventId,
    });
    expect(result).toMatchObject({
      expectedClaimState: "SETTLING",
      firstLossApplied: { amountMinor: "10" },
      principalPaid: { amountMinor: "8" },
      seniorLoss: { amountMinor: "0" },
      servicingFeePaid: { amountMinor: "2" },
    });
  });

  it("marks the uncovered final principal gap as senior loss requiring resolution", () => {
    const result = calculateWaterfall({
      finalSettlement: true,
      financingFeeDue: money("3"),
      position,
      servicingFeeDue: money("2"),
      settlement: money("10"),
      settlementEventId,
    });
    expect(result).toMatchObject({
      expectedClaimState: "SHORTFALL",
      firstLossApplied: { amountMinor: "10" },
      seniorLoss: { amountMinor: "46" },
    });
  });

  it("accepts the exact database Money boundary and rejects overflow without floating point", () => {
    const maximum = "9".repeat(38);
    expect(() => calculateWaterfall({
      finalSettlement: false,
      financingFeeDue: money("0"),
      position: { ...position, outstandingPrincipal: money(maximum) },
      servicingFeeDue: money("0"),
      settlement: money(maximum),
      settlementEventId,
    })).not.toThrow();
    expect(() => calculateWaterfall({
      finalSettlement: false,
      financingFeeDue: money("0"),
      position: { ...position, outstandingPrincipal: money("1" + "0".repeat(38)) },
      servicingFeeDue: money("0"),
      settlement: money("1"),
      settlementEventId,
    })).toThrow(/exact Money range/);
  });
});

describe("settlement replay and lost-response orchestration", () => {
  it("replays identical external events and rejects changed content", async () => {
    const journal = new InMemorySettlementJournal({ nextId: () => settlementEventId });
    const first = await journal.ingest(context, settlementInput());
    await expect(journal.ingest({ ...context, idempotencyKey: "settlement-idempotency-0002" }, settlementInput()))
      .resolves.toMatchObject({ id: first.id, replayed: true });
    await expect(journal.ingest(
      { ...context, idempotencyKey: "settlement-idempotency-0003" },
      settlementInput({ amount: money("11"), sourceHash: "2".repeat(64) }),
    )).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT", retryable: false });
  });

  it("never resubmits an ambiguous response and recovers through canonical result_hash", async () => {
    let next = 0;
    const ids = [settlementEventId, "01980a12-3456-789a-8abc-def012345685"];
    const journal = new InMemorySettlementJournal({ nextId: () => ids[next++]! });
    journal.positions.set(claimId, position);
    await journal.ingest(context, settlementInput());
    const submit = vi.fn(async () => {
      throw new WaterfallSubmissionError("RPC_TIMEOUT", "lost response", true);
    });
    const service = new SettlementService({
      canonicalEvents: journal,
      journal,
      servicerAddress,
      submitter: { mode: "SANDBOX", submit },
    });
    const command = {
      claimId,
      expectedVersion: 1,
      finalSettlement: true,
      financingFeeDue: money("3"),
      servicingFeeDue: money("2"),
      settlementEventId,
    };
    const ambiguous = await service.executeWaterfall(context, command);
    expect(ambiguous.status).toBe("SUBMITTING_AMBIGUOUS");
    journal.canonicalEvents.set(ambiguous.allocation.resultHash, {
      eventId: "0000000000000001-0000000000",
      resultHash: ambiguous.allocation.resultHash,
      transactionHash: "b".repeat(64),
    });
    await expect(service.executeWaterfall(context, command)).resolves.toMatchObject({
      status: "PENDING_RECONCILIATION",
      transactionHash: "b".repeat(64),
    });
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("fails closed for non-settlement events and incompatible Money units", async () => {
    const journal = new InMemorySettlementJournal({ nextId: () => settlementEventId });
    journal.positions.set(claimId, position);
    await journal.ingest(context, settlementInput({ eventType: "REFUND" }));
    const service = new SettlementService({
      canonicalEvents: journal,
      journal,
      servicerAddress,
      submitter: { mode: "SANDBOX", submit: vi.fn() },
    });
    await expect(service.executeWaterfall(context, {
      claimId,
      expectedVersion: 1,
      finalSettlement: false,
      financingFeeDue: money("0"),
      servicingFeeDue: money("0"),
      settlementEventId,
    })).rejects.toBeInstanceOf(SettlementProtocolError);
  });

  it("rejects a stale waterfall If-Match before any chain submission", async () => {
    const journal = new InMemorySettlementJournal({ nextId: () => settlementEventId });
    journal.positions.set(claimId, position);
    journal.claimVersions.set(claimId, 2);
    await journal.ingest(context, settlementInput());
    const submit = vi.fn();
    const service = new SettlementService({
      canonicalEvents: journal,
      journal,
      servicerAddress,
      submitter: { mode: "SANDBOX", submit } as WaterfallSubmissionPort,
    });
    await expect(service.executeWaterfall(context, {
      claimId,
      expectedVersion: 1,
      finalSettlement: false,
      financingFeeDue: money("0"),
      servicingFeeDue: money("0"),
      settlementEventId,
    })).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    expect(submit).not.toHaveBeenCalled();
  });
});

function membership(role: ActiveMembership["grants"][number]["role"]): ActiveMembership {
  return { actorId, grants: [{ grantId: roleGrantId, role }], membershipId, tenantId };
}

describe("settlement route handoff", () => {
  it("exports exactly the frozen routes with assignment-scoped institutional RBAC", async () => {
    const app = Fastify();
    app.setErrorHandler((error, _request, reply) => reply.code(error instanceof AuthorizationError ? 403 : 400).send({
      error: error instanceof Error ? error.message : "Unknown error",
    }));
    let active = membership("SERVICER");
    let assignments = [{ capability: "MANAGE", resourceId: claimId, resourceType: "CLAIM" }];
    const ingest = vi.fn(async () => ({ ...settlementInput(), id: settlementEventId, payloadHash: "2".repeat(64), receivedAt: "2026-07-15T12:01:00.000Z", replayed: false }));
    const executeWaterfall = vi.fn(async () => ({ allocation: {}, claimId, claimKey, id: settlementEventId, replayed: false, status: "PENDING_RECONCILIATION" }));
    const reconcile = vi.fn(async () => ({
      claimId,
      indexed: { duplicates: 0, indexed: 1, latestLedger: 101, staleCheckpoints: 0 },
      reconciliation: { mismatched: 0, pending: 0, reconciled: 1 },
      through: "2026-07-15T12:00:00.000Z",
    }));
    await registerSettlementRoutes(app, {
      findAssignments: async () => assignments,
      findMembership: async (input) => input.tenantId === tenantId ? active : undefined,
      reconciliation: { reconcile },
      sandbox: false,
      service: { ingest, executeWaterfall } as unknown as SettlementService,
      verifier: { verify: async () => ({ subject: actorId }) },
    });
    const headers = {
      authorization: "Bearer test",
      "idempotency-key": context.idempotencyKey,
      "x-jejak-tenant-id": tenantId,
    };
    const settlementResponse = await app.inject({ body: settlementInput(), headers, method: "POST", url: "/v1/settlement-events" });
    expect(settlementResponse).toMatchObject({ statusCode: 201, headers: { "x-jejak-sandbox": "false" } });
    expect(settlementResponse.json()).toMatchObject({ meta: { sandbox: false } });
    await expect(app.inject({
      body: { finalSettlement: true, financingFeeDue: money("3"), servicingFeeDue: money("2"), settlementEventId },
      headers: { ...headers, "if-match": "1" },
      method: "POST",
      url: `/v1/claims/${claimId}/waterfall`,
    })).resolves.toMatchObject({ statusCode: 200 });
    await expect(app.inject({
      body: { through: "2026-07-15T12:00:00.000Z" },
      headers: { ...headers, "if-match": "1" },
      method: "POST",
      url: `/v1/claims/${claimId}/reconcile`,
    })).resolves.toMatchObject({ statusCode: 200 });
    expect(reconcile).toHaveBeenCalledWith(expect.objectContaining({
      claimId,
      expectedVersion: 1,
      through: "2026-07-15T12:00:00.000Z",
    }));
    assignments = [];
    await expect(app.inject({
      body: { through: "2026-07-15T12:00:00.000Z" },
      headers: { ...headers, "if-match": "1" },
      method: "POST",
      url: `/v1/claims/${claimId}/reconcile`,
    })).resolves.toMatchObject({ statusCode: 403 });
    assignments = [{ capability: "MANAGE", resourceId: claimId, resourceType: "CLAIM" }];
    await expect(app.inject({
      body: settlementInput(),
      headers: { ...headers, "x-jejak-tenant-id": otherTenantId },
      method: "POST",
      url: "/v1/settlement-events",
    })).resolves.toMatchObject({ statusCode: 403 });
    active = membership("FACILITY");
    await expect(app.inject({ body: settlementInput(), headers, method: "POST", url: "/v1/settlement-events" }))
      .resolves.toMatchObject({ statusCode: 403 });
    await app.close();
  });
});

describe("settlement-to-chain reconciliation bridge", () => {
  it("indexes before reconciling so BE-15 can durably project a canonical result", async () => {
    const calls: string[] = [];
    const bridge = new ChainSettlementReconciliationBridge({
      index: async () => {
        calls.push("index");
        return { duplicates: 1, indexed: 2, latestLedger: 110, staleCheckpoints: 0 };
      },
      reconcile: async () => {
        calls.push("reconcile");
        return { mismatched: 0, pending: 0, reconciled: 1 };
      },
    }, { assertCurrent: async () => { calls.push("version"); } });
    await expect(bridge.reconcile({
      claimId,
      context,
      expectedVersion: 1,
      through: "2026-07-15T12:00:00.000Z",
    })).resolves.toMatchObject({ claimId, reconciliation: { reconciled: 1 } });
    expect(calls).toEqual(["version", "index", "reconcile"]);
  });

  it("does not reconcile after a retryable indexing timeout", async () => {
    const reconcile = vi.fn();
    const bridge = new ChainSettlementReconciliationBridge({
      index: async () => { throw new WaterfallSubmissionError("RPC_TIMEOUT", "timeout", false); },
      reconcile,
    }, { assertCurrent: async () => undefined });
    await expect(bridge.reconcile({
      claimId,
      context,
      expectedVersion: 1,
      through: "2026-07-15T12:00:00.000Z",
    })).rejects.toMatchObject({ retryable: true });
    expect(reconcile).not.toHaveBeenCalled();
  });

  it("rejects a stale reconcile If-Match before asking BE-15 to index", async () => {
    const index = vi.fn();
    const bridge = new ChainSettlementReconciliationBridge({ index, reconcile: vi.fn() }, {
      assertCurrent: async () => { throw new Error("stale claim version"); },
    });
    await expect(bridge.reconcile({
      claimId,
      context,
      expectedVersion: 1,
      through: "2026-07-15T12:00:00.000Z",
    })).rejects.toThrow("stale claim version");
    expect(index).not.toHaveBeenCalled();
  });
});

describe("waterfall submitter runtime boundaries", () => {
  const command = {
    allocation: calculateWaterfall({
      finalSettlement: false,
      financingFeeDue: money("0"),
      position,
      servicingFeeDue: money("0"),
      settlement: money("10"),
      settlementEventId,
    }),
    claimKey,
    servicerAddress,
  };

  it("returns deterministic sandbox receipts and preserves lost-response ambiguity", async () => {
    const sandbox = new DeterministicWaterfallSubmitter();
    await expect(sandbox.submit(command)).resolves.toEqual(await sandbox.submit(command));
    expect(sandbox.mode).toBe("SANDBOX");

    const lost = new DeterministicWaterfallSubmitter("LOST_RESPONSE");
    await expect(lost.submit(command)).rejects.toMatchObject({ retryable: true, submissionMayHaveSucceeded: true });
    await expect(lost.submit(command)).resolves.toMatchObject({ transactionHash: expect.stringMatching(/^[0-9a-f]{64}$/) });
  });

  it("fails production closed before constructing or submitting without a signer boundary", async () => {
    const production = new GeneratedWaterfallSubmitter({});
    expect(production).toMatchObject({ configured: false, mode: "PRODUCTION" });
    await expect(production.submit(command)).rejects.toMatchObject({ code: "CONFIGURATION", retryable: false });
    expect(createRuntimeWaterfallSubmitter({ mode: "SANDBOX" }).mode).toBe("SANDBOX");
    expect(createRuntimeWaterfallSubmitter({ mode: "PRODUCTION" })).toMatchObject({
      configured: false,
      mode: "PRODUCTION",
    });
  });
});
