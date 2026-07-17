import { describe, expect, it, vi } from "vitest";

import { buildApp } from "../src/app.js";
import type { AppConfig } from "../src/config/env.js";
import type { FacilityFundingRouteDependencies } from "../src/modules/facility/routes.js";
import type { IssuerIssueRouteDependencies } from "../src/modules/issuer/routes.js";
import type { SettlementRouteDependencies } from "../src/modules/settlement/routes.js";
import type { ControlRouteDependencies } from "../src/modules/control/routes.js";
import type { RefundSpikeRouteDependencies } from "../src/modules/demo/refund-spike-routes.js";
import type { ResolutionRouteDependencies } from "../src/modules/resolution/routes.js";
import type { WorkspaceRouteDependencies } from "../src/modules/workspace/routes.js";

const claimId = "01980a12-3456-789a-8abc-def012345701";
const tenantId = "01980a12-3456-789a-8abc-def012345708";
const actor = {
  actorId: "01980a12-3456-789a-8abc-def012345705",
  correlationId: "runtime-route-correlation",
  idempotencyKey: "runtime-route-idempotency-key",
  requestId: "runtime-route-request",
  requestedAt: "2026-07-15T12:00:00.000Z",
  tenantId,
};

const config: AppConfig = {
  allowTestProjectMutation: false,
  appVersion: "test",
  host: "127.0.0.1",
  jccTtlMs: 86_400_000,
  logLevel: "silent",
  nodeEnv: "test",
  otelEnabled: false,
  otelServiceName: "jejak-api-test",
  partnerMode: "SANDBOX",
  port: 4000,
  webOrigin: "http://localhost:3000",
};

function issuerDependencies(): IssuerIssueRouteDependencies {
  return {
    authorizeIssuer: vi.fn().mockResolvedValue(actor),
    buildIssueContext: vi.fn().mockResolvedValue({
      ...actor,
      aggregateId: claimId,
      operationId: "issueClaim",
      transaction: {
        amountMinor: "1",
        assetCode: "JCLAIM",
        claimId,
        destination: "sandbox-destination",
        envelopeHash: "a".repeat(64),
        networkPassphrase: "SANDBOX",
        operation: "ISSUE",
        sequence: "0",
        source: "sandbox-source",
      },
    }),
    execute: vi.fn().mockResolvedValue({
      adapterMode: "SANDBOX",
      approved: true,
      approvedPayloadHash: "b".repeat(64),
      correlationId: actor.correlationId,
      decidedAt: actor.requestedAt,
      partnerReference: "sandbox-issuer-reference",
      reasonCodes: [],
      receiptHash: "c".repeat(64),
      requestHash: "d".repeat(64),
      sandbox: true,
      status: "APPROVED",
    }),
  };
}

function facilityDependencies(): FacilityFundingRouteDependencies {
  return {
    authorizeFacility: vi.fn().mockResolvedValue(actor),
    buildFundingContext: vi.fn().mockResolvedValue({
      ...actor,
      chainIntent: {
        acceptedTermsHash: "a".repeat(64), assetControllerContractId: "asset", claimKey: "b".repeat(64),
        facilityContractId: "facility", facilityHolder: "holder", facilityId: "facility-id", facilityOperator: "operator",
        facilityTreasury: "treasury", firstLossAmountMinor: "0", issuerOperator: "issuer", resultHash: "c".repeat(64), sellerPayoutAccount: "seller",
      },
      chainMode: "SEPARATE",
      claimId,
      compensationEnvelopeHash: "d".repeat(64),
      expectedClaimVersion: 1,
      facilityPositionId: "01980a12-3456-789a-8abc-def012345709",
      fundEnvelopeHash: "e".repeat(64),
      issueEnvelopeHash: "f".repeat(64),
      issuerTransaction: {
        amountMinor: "1", assetCode: "JCLAIM", claimId, destination: "holder", envelopeHash: "f".repeat(64),
        networkPassphrase: "SANDBOX", operation: "ISSUE", sequence: "0", source: "issuer",
      },
      network: "SANDBOX",
      offerId: "01980a12-3456-789a-8abc-def012345702",
      operationId: "fundClaim",
      source: { amountMinor: "1", currency: "USDC", scale: 6 },
    }),
    execute: vi.fn().mockResolvedValue({ operationRecordId: "operation", sandbox: true, status: "WAITING_EXTERNAL" }),
  };
}

function settlementDependencies(): SettlementRouteDependencies {
  return {
    findAssignments: vi.fn().mockResolvedValue([{ capability: "MANAGE", resourceId: claimId, resourceType: "CLAIM" }]),
    findMembership: vi.fn().mockResolvedValue({
      actorId: actor.actorId,
      grants: [{ grantId: "grant", role: "SERVICER" }],
      membershipId: "membership",
      tenantId,
    }),
    reconciliation: { reconcile: vi.fn().mockResolvedValue({ claimId, indexed: { duplicates: 0, indexed: 0, latestLedger: 1, staleCheckpoints: 0 }, reconciliation: { mismatched: 0, pending: 0, reconciled: 0 }, through: actor.requestedAt }) },
    sandbox: true,
    service: { executeWaterfall: vi.fn(), ingest: vi.fn() } as never,
    verifier: { verify: vi.fn().mockResolvedValue({ subject: "auth-subject" }) },
  };
}

describe("runtime route composition", () => {
  it("registers the central P1-07 route surface when glue dependencies are supplied", async () => {
    const app = await buildApp({
      config,
      controlDependencies: {} as ControlRouteDependencies,
      logger: false,
      refundSpikeDependencies: {} as RefundSpikeRouteDependencies,
      resolutionDependencies: {} as ResolutionRouteDependencies,
      workspaceDependencies: {} as WorkspaceRouteDependencies,
    });

    for (const route of [
      { method: "GET", url: "/v1/claims/:id/workspace" },
      { method: "POST", url: "/v1/claims/:id/control-evidence" },
      { method: "POST", url: "/v1/claims/:id/control-decision" },
      { method: "POST", url: "/v1/claims/:id/pause" },
      { method: "POST", url: "/v1/claims/:id/resolution" },
      { method: "POST", url: "/v1/demo/claims/:id/refund-spike" },
    ]) {
      expect(app.hasRoute(route)).toBe(true);
    }
    await app.close();
  });

  it("registers only frozen issuer, facility, and settlement paths when dependencies are supplied", async () => {
    const app = await buildApp({
      config,
      facilityFundingDependencies: facilityDependencies(),
      issuerIssueDependencies: issuerDependencies(),
      logger: false,
      settlementDependencies: settlementDependencies(),
    });
    const headers = { authorization: "Bearer test-token", "idempotency-key": actor.idempotencyKey, "if-match": "1", "x-jejak-tenant-id": tenantId };
    expect((await app.inject({ headers, method: "POST", payload: { attestationId: "01980a12-3456-789a-8abc-def012345703", controlEvidenceId: "01980a12-3456-789a-8abc-def012345704" }, url: `/v1/claims/${claimId}/issue` })).statusCode).toBe(202);
    expect((await app.inject({ headers, method: "POST", payload: { maximumAmount: { amountMinor: "1", currency: "USDC", scale: 6 }, offerId: "01980a12-3456-789a-8abc-def012345702" }, url: `/v1/claims/${claimId}/fund` })).statusCode).toBe(202);
    expect((await app.inject({ headers, method: "POST", payload: { through: actor.requestedAt }, url: `/v1/claims/${claimId}/reconcile` })).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: `/v1/claims/${claimId}/funding` })).statusCode).toBe(404);
    await app.close();
  });
});
