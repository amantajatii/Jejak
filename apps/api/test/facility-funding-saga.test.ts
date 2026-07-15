import { describe, expect, it } from "vitest";

import { AnchorPayoutOrchestrator, DeterministicAnchorSandbox, InMemoryAnchorPayoutJournal } from "../src/modules/anchor/index.js";
import { DeterministicFundingChainSandbox, FacilityFundingCompensationService, FacilityFundingSagaService, InMemoryFundingSagaRepository, type FundingSagaContext } from "../src/modules/facility/index.js";
import { DeterministicIssuerSandbox, InMemoryIssuerOperationJournal, IssuerApprovalOrchestrator, type IssuerSandboxScenario } from "../src/modules/issuer/index.js";

const now = new Date("2026-07-15T12:00:00.000Z");
const context: FundingSagaContext = {
  actorId: "01980a12-3456-789a-8abc-def012345701",
  chainMode: "SEPARATE",
  claimId: "01980a12-3456-789a-8abc-def012345702",
  compensationEnvelopeHash: "d".repeat(64),
  correlationId: "01980a12-3456-789a-8abc-def012345703",
  expectedClaimVersion: 4,
  facilityPositionId: "01980a12-3456-789a-8abc-def012345704",
  fundEnvelopeHash: "f".repeat(64),
  idempotencyKey: "facility-funding-idempotency-001",
  issueEnvelopeHash: "e".repeat(64),
  issuerTransaction: {
    amountMinor: "64000000", assetCode: "JCLAIM", claimId: "01980a12-3456-789a-8abc-def012345702",
    destination: "GDESTINATION_SANDBOX_FACILITY", envelopeHash: "e".repeat(64),
    networkPassphrase: "Test SDF Network ; September 2015", operation: "ISSUE", sequence: "42", source: "GSOURCE_SANDBOX_ISSUER",
  },
  network: "TESTNET", offerId: "01980a12-3456-789a-8abc-def012345705",
  operationId: "fundFacility", requestId: "01980a12-3456-789a-8abc-def012345706", requestedAt: now.toISOString(),
  source: { amountMinor: "64000000", currency: "USDC", scale: 6 }, tenantId: "01980a12-3456-789a-8abc-def012345707",
};

function fixture(issuerScenario: IssuerSandboxScenario = "APPROVED", chainScenario: ConstructorParameters<typeof DeterministicFundingChainSandbox>[0] = "SUCCESS") {
  const repository = new InMemoryFundingSagaRepository();
  const issuer = new IssuerApprovalOrchestrator(new DeterministicIssuerSandbox({ clock: () => now, scenario: issuerScenario }), new InMemoryIssuerOperationJournal());
  const chain = new DeterministicFundingChainSandbox(chainScenario);
  const anchor = new AnchorPayoutOrchestrator(
    new DeterministicAnchorSandbox({ clock: () => now, config: { feeBps: 50, rateDenominator: "1", rateNumerator: "16000" }, failureMode: "SUCCESS" }),
    new InMemoryAnchorPayoutJournal(), { feeBps: 50, rateDenominator: "1", rateNumerator: "16000" },
  );
  return { anchor, chain, issuer, repository, service: new FacilityFundingSagaService(repository, issuer, chain, anchor) };
}

describe("BE-12 durable facility funding saga", () => {
  it("completes separate issue, funding, and SANDBOX payout exactly once", async () => {
    const item = fixture();
    const first = await item.service.execute(context);
    const replay = await item.service.execute(context);
    expect(first).toMatchObject({ sandbox: true, status: "COMPLETED", issuerReceipt: { approved: true, status: "APPROVED" }, anchorReceipt: { sandbox: true, status: "PAID" } });
    expect(replay).toEqual(first);
    expect(item.repository.outbox).toEqual([{ eventType: "facility.position.funded", sandbox: true }]);
    expect([...item.repository.submissions.values()].map((value) => value.receipt?.action)).toEqual(["ISSUE", "FUND"]);
  });

  it("supports atomic issue-and-fund and an exact deterministic chain receipt", async () => {
    const item = fixture();
    await item.service.execute({ ...context, chainMode: "ATOMIC" });
    const receipt = [...item.repository.submissions.values()][0]?.receipt;
    expect(receipt).toEqual({
      action: "ISSUE_AND_FUND", envelopeHash: "f".repeat(64), ledgerSequence: 1000001,
      network: "TESTNET", receiptHash: "486a56457d24e803e6447ca35c0e84bee6c3f05567682ccfb4fcc1bb267cec6c",
      requestHash: "70098b4c94f3b455736e57a2726b317f4cdb2e880ed2cc3a4fc6535d65a83ae3",
      sandbox: true, status: "CONFIRMED", transactionHash: "9e78bda7c62ded3b947b51716817eba0b22327413bbe8c702ecb9a39dc2cd25c",
    });
  });

  it.each(["PENDING", "ACTION_REQUIRED"] as const)("keeps issuer %s as waiting and never funds", async (scenario) => {
    const item = fixture(scenario);
    await expect(item.service.execute(context)).resolves.toMatchObject({ sandbox: true, status: "WAITING_EXTERNAL", issuerReceipt: { approved: false, status: scenario } });
    expect(item.repository.submissions.size).toBe(0);
  });

  it("rejects issuer denial and invalid preconditions before any chain action", async () => {
    const rejected = fixture("REJECTED");
    await expect(rejected.service.execute(context)).rejects.toMatchObject({ code: "PARTNER_REJECTED" });
    expect(rejected.repository.submissions.size).toBe(0);
    const repository = new InMemoryFundingSagaRepository(false);
    const good = fixture();
    const service = new FacilityFundingSagaService(repository, good.issuer, good.chain, good.anchor);
    await expect(service.execute(context)).rejects.toThrow("CONTROL_NOT_VERIFIED");
    expect(repository.submissions.size).toBe(0);
  });

  it("resumes after timeout and reconciles a lost chain response without resubmitting business steps", async () => {
    const timed = fixture("APPROVED", "TIMEOUT_THEN_SUCCESS");
    await expect(timed.service.execute(context)).rejects.toMatchObject({ code: "PARTNER_TIMEOUT", retryable: true });
    await expect(new FacilityFundingCompensationService(timed.repository, timed.chain).execute(context)).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
    await expect(timed.service.execute(context)).rejects.toMatchObject({ code: "PARTNER_TIMEOUT", retryable: true });
    await expect(timed.service.execute(context)).resolves.toMatchObject({ status: "COMPLETED" });
    expect([...timed.repository.submissions.values()].filter((value) => value.receipt !== undefined)).toHaveLength(2);

    const lost = fixture("APPROVED", "LOST_RESPONSE");
    await expect(lost.service.execute(context)).rejects.toMatchObject({ code: "PARTNER_TIMEOUT" });
    await expect(lost.service.execute(context)).rejects.toMatchObject({ code: "PARTNER_TIMEOUT" });
    await expect(lost.service.execute(context)).resolves.toMatchObject({ status: "COMPLETED" });
    expect([...lost.repository.submissions.values()].map((value) => value.receipt?.action)).toEqual(["ISSUE", "FUND"]);
  });

  it("requires explicit compensation after issuance succeeds and funding fails", async () => {
    const item = fixture("APPROVED", "FUND_REJECTED");
    await expect(item.service.execute(context)).rejects.toMatchObject({ code: "PARTNER_REJECTED" });
    await expect(item.repository.load(context, [...item.repository.submissions.values()][0]!.id)).resolves.toMatchObject({ status: "COMPENSATION_REQUIRED" });
    const result = await new FacilityFundingCompensationService(item.repository, item.chain).execute(context);
    expect(result).toMatchObject({ sandbox: true, status: "COMPENSATED" });
    expect([...item.repository.submissions.values()].map((value) => value.receipt?.action)).toEqual(["ISSUE", undefined, "COMPENSATE"]);
  });

  it("rejects protocol mismatch and fails closed without a production chain", async () => {
    const mismatch = fixture("APPROVED", "PROTOCOL_MISMATCH");
    await expect(mismatch.service.execute(context)).rejects.toMatchObject({ code: "PARTNER_REJECTED" });
    expect(mismatch.repository.outbox).toHaveLength(0);

    const normal = fixture();
    const service = new FacilityFundingSagaService(normal.repository, normal.issuer, {
      mode: "PRODUCTION",
      findAction: async () => null,
      submitAction: async () => { throw new Error("must not execute"); },
    }, normal.anchor);
    await expect(service.execute(context)).rejects.toMatchObject({ code: "PARTNER_REJECTED" });
    expect(normal.repository.submissions.size).toBe(0);
  });

  it("keeps document bytes, upload tokens, and signed URLs out of audit and outbox", async () => {
    const item = fixture();
    await item.service.execute({ ...context, issuerTransaction: { ...context.issuerTransaction, destination: "https://storage.invalid/signed?token=secret" } });
    const serialized = JSON.stringify({ audit: item.repository.audit, outbox: item.repository.outbox });
    expect(serialized).not.toMatch(/storage\.invalid|signed\?token|rawBytes|documentSecretRef|uploadToken/i);
    expect(serialized).toContain('"sandbox":true');
  });
});
