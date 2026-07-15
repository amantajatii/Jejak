import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";

import { AuthorizationError } from "../src/auth/authorization.js";
import type { ActiveMembership } from "../src/auth/membership-repository.js";
import { InMemorySettlementJournal } from "../src/modules/settlement/adapters/in-memory-settlement-journal.js";
import { SettlementService } from "../src/modules/settlement/application/settlement-service.js";
import { calculateWaterfall, SettlementProtocolError } from "../src/modules/settlement/domain/settlement.js";
import type { SettlementContext, WaterfallSubmissionPort } from "../src/modules/settlement/ports/settlement.js";
import { WaterfallSubmissionError } from "../src/modules/settlement/ports/settlement.js";
import { registerSettlementRoutes } from "../src/modules/settlement/routes.js";

const tenantId = "01980a12-3456-789a-8abc-def012345678";
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
      submitter: { submit } as WaterfallSubmissionPort,
    });
    const command = {
      claimId,
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
      submitter: { submit: vi.fn() },
    });
    await expect(service.executeWaterfall(context, {
      claimId,
      finalSettlement: false,
      financingFeeDue: money("0"),
      servicingFeeDue: money("0"),
      settlementEventId,
    })).rejects.toBeInstanceOf(SettlementProtocolError);
  });
});

function membership(role: ActiveMembership["grants"][number]["role"]): ActiveMembership {
  return { actorId, grants: [{ grantId: roleGrantId, role }], membershipId, tenantId };
}

describe("settlement route handoff", () => {
  it("exports uncomposed SERVICER routes with institutional RBAC", async () => {
    const app = Fastify();
    app.setErrorHandler((error, _request, reply) => reply.code(error instanceof AuthorizationError ? 403 : 400).send({
      error: error instanceof Error ? error.message : "Unknown error",
    }));
    let active = membership("SERVICER");
    const ingest = vi.fn(async () => ({ ...settlementInput(), id: settlementEventId, payloadHash: "2".repeat(64), receivedAt: "2026-07-15T12:01:00.000Z", replayed: false }));
    const executeWaterfall = vi.fn(async () => ({ allocation: {}, claimId, claimKey, id: settlementEventId, replayed: false, status: "PENDING_RECONCILIATION" }));
    await registerSettlementRoutes(app, {
      findMembership: async () => active,
      service: { ingest, executeWaterfall } as unknown as SettlementService,
      verifier: { verify: async () => ({ subject: actorId }) },
    });
    const headers = {
      authorization: "Bearer test",
      "idempotency-key": context.idempotencyKey,
      "x-jejak-tenant-id": tenantId,
    };
    await expect(app.inject({ body: settlementInput(), headers, method: "POST", url: "/v1/settlement-events" }))
      .resolves.toMatchObject({ statusCode: 201 });
    await expect(app.inject({
      body: { finalSettlement: true, financingFeeDue: money("3"), servicingFeeDue: money("2"), settlementEventId },
      headers,
      method: "POST",
      url: `/v1/claims/${claimId}/waterfall`,
    })).resolves.toMatchObject({ statusCode: 202 });
    active = membership("FACILITY");
    await expect(app.inject({ body: settlementInput(), headers, method: "POST", url: "/v1/settlement-events" }))
      .resolves.toMatchObject({ statusCode: 403 });
    await app.close();
  });
});
