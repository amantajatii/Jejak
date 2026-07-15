import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";

import {
  registerFacilityFundingRoutes,
  GeneratedStellarFundingChain,
  ServerSideFundingContextBuilder,
  type FacilityFundingRouteDependencies,
  type FundingSagaContext,
} from "../src/modules/facility/index.js";
import {
  registerIssuerIssueRoutes,
  type IssuerIssueRouteDependencies,
} from "../src/modules/issuer/index.js";

const claimId = "01980a12-3456-789a-8abc-def012345701";
const offerId = "01980a12-3456-789a-8abc-def012345702";
const attestationId = "01980a12-3456-789a-8abc-def012345703";
const controlEvidenceId = "01980a12-3456-789a-8abc-def012345704";
const actor = {
  actorId: "01980a12-3456-789a-8abc-def012345705",
  correlationId: "01980a12-3456-789a-8abc-def012345706",
  idempotencyKey: "issuer-facility-registrar-idempotency-key",
  requestId: "01980a12-3456-789a-8abc-def012345707",
  requestedAt: "2026-07-15T12:00:00.000Z",
  tenantId: "01980a12-3456-789a-8abc-def012345708",
};

const fundingContext: FundingSagaContext = {
  ...actor,
  chainIntent: {
    acceptedTermsHash: "a".repeat(64), assetControllerContractId: "CASSET", claimKey: "b".repeat(64),
    attestationEnvelopeHash: "c".repeat(64), attestationId, controlEvidenceHash: "d".repeat(64), controlEvidenceId,
    facilityContractId: "CFACILITY", facilityHolder: "GFACILITYHOLDER", facilityId: "c".repeat(64),
    facilityOperator: "GFACILITYOPERATOR", facilityTreasury: "GFACILITYTREASURY", firstLossAmountMinor: "0",
    issuerOperator: "GISSUEROPERATOR", payoutReference: "sandbox-payout-ref", resultHash: "d".repeat(64), sellerPayoutAccount: "GSELLERPAYOUT",
  },
  chainMode: "SEPARATE", claimId, compensationEnvelopeHash: "e".repeat(64), expectedClaimVersion: 4,
  facilityPositionId: "01980a12-3456-789a-8abc-def012345709", fundEnvelopeHash: "f".repeat(64),
  issueEnvelopeHash: "1".repeat(64), issuerTransaction: {
    amountMinor: "64000000", assetCode: "JCLAIM", claimId, destination: "GFACILITYHOLDER", envelopeHash: "1".repeat(64),
    networkPassphrase: "TESTNET", operation: "ISSUE", sequence: "1", source: "GISSUEROPERATOR",
  },
  network: "TESTNET", offerId, operationId: "fundClaim", source: { amountMinor: "64000000", currency: "USDC", scale: 6 },
};

function facilityDependencies(): FacilityFundingRouteDependencies {
  return {
    authorizeFacility: vi.fn().mockResolvedValue(actor),
    buildFundingContext: vi.fn().mockResolvedValue(fundingContext),
    execute: vi.fn().mockResolvedValue({ operationRecordId: "01980a12-3456-789a-8abc-def012345710", sandbox: true, status: "WAITING_EXTERNAL" }),
  };
}

function issuerDependencies(): IssuerIssueRouteDependencies {
  return {
    authorizeIssuer: vi.fn().mockResolvedValue(actor),
    buildIssueContext: vi.fn().mockResolvedValue({
      ...actor, aggregateId: claimId, operationId: "issueClaim", transaction: fundingContext.issuerTransaction,
    }),
    execute: vi.fn().mockResolvedValue({
      adapterMode: "SANDBOX", approved: true, approvedPayloadHash: "1".repeat(64), correlationId: actor.correlationId,
      decidedAt: actor.requestedAt, partnerReference: "sandbox-issuer-reference", reasonCodes: [], receiptHash: "2".repeat(64),
      requestHash: "3".repeat(64), sandbox: true, status: "APPROVED",
    }),
  };
}

describe("issuer and facility frozen registrars", () => {
  it("registers only the frozen fund route/body and passes exact Money plus If-Match server-side", async () => {
    const app = Fastify();
    const deps = facilityDependencies();
    await registerFacilityFundingRoutes(app, deps);
    const response = await app.inject({
      headers: { "if-match": "4" }, method: "POST",
      payload: { maximumAmount: { amountMinor: "64000000", currency: "USDC", scale: 6 }, offerId }, url: `/v1/claims/${claimId}/fund`,
    });
    expect(response.statusCode).toBe(202);
    expect(deps.buildFundingContext).toHaveBeenCalledWith(expect.objectContaining({ claimId, expectedClaimVersion: 4, offerId, maximumAmount: { amountMinor: "64000000", currency: "USDC", scale: 6 } }));
    expect((await app.inject({ method: "POST", url: `/v1/claims/${claimId}/funding` })).statusCode).toBe(404);
    await app.close();
  });

  it("does not execute funding when selected-tenant, FACILITY, or resource authorization fails", async () => {
    const app = Fastify();
    const deps = facilityDependencies();
    deps.authorizeFacility = vi.fn().mockRejectedValue(Object.assign(new Error("FORBIDDEN"), { statusCode: 403 }));
    await registerFacilityFundingRoutes(app, deps);
    const response = await app.inject({ headers: { "if-match": "4" }, method: "POST", payload: { maximumAmount: { amountMinor: "1", currency: "USDC", scale: 6 }, offerId }, url: `/v1/claims/${claimId}/fund` });
    expect(response.statusCode).toBe(403);
    expect(deps.buildFundingContext).not.toHaveBeenCalled();
    expect(deps.execute).not.toHaveBeenCalled();
    await app.close();
  });

  it("registers the frozen issue route and prevents ISSUE execution before ISSUER assignment succeeds", async () => {
    const app = Fastify();
    const deps = issuerDependencies();
    await registerIssuerIssueRoutes(app, deps);
    const response = await app.inject({ headers: { "if-match": "4" }, method: "POST", payload: { attestationId, controlEvidenceId }, url: `/v1/claims/${claimId}/issue` });
    expect(response.statusCode).toBe(202);
    expect(deps.buildIssueContext).toHaveBeenCalledWith(expect.objectContaining({ attestationId, claimId, controlEvidenceId, expectedClaimVersion: 4 }));
    await app.close();

    const forbidden = Fastify();
    const denied = issuerDependencies();
    denied.authorizeIssuer = vi.fn().mockRejectedValue(Object.assign(new Error("FORBIDDEN"), { statusCode: 403 }));
    await registerIssuerIssueRoutes(forbidden, denied);
    expect((await forbidden.inject({ headers: { "if-match": "4" }, method: "POST", payload: { attestationId, controlEvidenceId }, url: `/v1/claims/${claimId}/issue` })).statusCode).toBe(403);
    expect(denied.execute).not.toHaveBeenCalled();
    await forbidden.close();
  });

  it("fails closed in production when generated Stellar construction has no real signer", async () => {
    const chain = new GeneratedStellarFundingChain({
      assetControllerContractId: fundingContext.chainIntent.assetControllerContractId,
      facilityContractId: fundingContext.chainIntent.facilityContractId,
      lookup: { find: async () => null }, mode: "PRODUCTION", networkPassphrase: "TESTNET",
      publicKey: "GFACILITYOPERATOR", rpcUrl: "https://rpc.invalid",
    });
    await expect(chain.submitAction({
      action: "ISSUE", acceptedTermsHash: fundingContext.chainIntent.acceptedTermsHash,
      assetControllerContractId: fundingContext.chainIntent.assetControllerContractId, claimId,
      claimKey: fundingContext.chainIntent.claimKey, envelopeHash: fundingContext.issueEnvelopeHash,
      facilityContractId: fundingContext.chainIntent.facilityContractId, facilityHolder: fundingContext.chainIntent.facilityHolder,
      facilityId: fundingContext.chainIntent.facilityId, facilityOperator: fundingContext.chainIntent.facilityOperator,
      facilityTreasury: fundingContext.chainIntent.facilityTreasury, firstLossAmountMinor: "0", idempotencyKey: "stable-chain-idempotency",
      issuerOperator: fundingContext.chainIntent.issuerOperator, network: "TESTNET", requestedAt: actor.requestedAt,
      resultHash: fundingContext.chainIntent.resultHash, sellerPayoutAccount: fundingContext.chainIntent.sellerPayoutAccount,
      source: fundingContext.source, tenantId: actor.tenantId,
    })).rejects.toMatchObject({ code: "PARTNER_REJECTED", retryable: false });
  });

  it("builds funding context from authoritative facts, leaving the public body unable to replace them", async () => {
    const facts = { ...fundingContext };
    const builder = new ServerSideFundingContextBuilder({
      load: vi.fn().mockResolvedValue({
        chainIntent: facts.chainIntent, chainMode: facts.chainMode, claimId, compensationEnvelopeHash: facts.compensationEnvelopeHash,
        facilityPositionId: facts.facilityPositionId, fundEnvelopeHash: facts.fundEnvelopeHash, issueEnvelopeHash: facts.issueEnvelopeHash,
        issuerTransaction: facts.issuerTransaction, network: facts.network, operationId: facts.operationId, offerId, tenantId: actor.tenantId,
      }),
    });
    const built = await builder.build({ ...actor, claimId, expectedClaimVersion: 4, maximumAmount: { amountMinor: "10", currency: "USDC", scale: 6 }, offerId });
    expect(built).toMatchObject({
      chainIntent: expect.objectContaining({ acceptedTermsHash: fundingContext.chainIntent.acceptedTermsHash, attestationId, controlEvidenceId, claimKey: fundingContext.chainIntent.claimKey, payoutReference: "sandbox-payout-ref" }),
      issuerTransaction: fundingContext.issuerTransaction,
      source: { amountMinor: "10", currency: "USDC", scale: 6 },
    });
  });
});
