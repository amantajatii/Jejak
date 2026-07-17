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
  chainIntent: {
    acceptedTermsHash: "a".repeat(64), assetControllerContractId: "CASSETCONTROLLER_SANDBOX", claimKey: "b".repeat(64),
    attestationEnvelopeHash: "c".repeat(64), attestationId: "01980a12-3456-789a-8abc-def012345708",
    controlEvidenceHash: "d".repeat(64), controlEvidenceId: "01980a12-3456-789a-8abc-def012345709",
    facilityContractId: "CFACILITY_SANDBOX", facilityHolder: "GFACILITY_HOLDER_SANDBOX", facilityId: "c".repeat(64),
    facilityOperator: "GFACILITY_OPERATOR_SANDBOX", facilityTreasury: "GFACILITY_TREASURY_SANDBOX", firstLossAmountMinor: "0",
    issuerOperator: "GISSUER_OPERATOR_SANDBOX", payoutReference: "sandbox-payout-ref", resultHash: "d".repeat(64), sellerPayoutAccount: "GSELLER_PAYOUT_SANDBOX",
  },
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
  it("submits issuance once and remains pending until BE-15 reconciliation", async () => {
    const item = fixture();
    const first = await item.service.execute(context);
    const replay = await item.service.execute(context);
    expect(first).toMatchObject({ sandbox: true, status: "WAITING_EXTERNAL", issuerReceipt: { approved: true, status: "APPROVED" } });
    expect(replay).toMatchObject({ status: "WAITING_EXTERNAL" });
    expect(item.repository.outbox).toEqual([]);
    expect([...item.repository.submissions.values()].map((value) => value.receipt?.action)).toEqual(["ISSUE"]);
  });

  it("treats changed transport metadata as the same idempotent funding payload", async () => {
    const item = fixture();
    await expect(item.service.execute(context)).resolves.toMatchObject({ status: "WAITING_EXTERNAL" });
    await expect(item.service.execute({
      ...context,
      correlationId: "01980a12-3456-789a-8abc-def012345710",
      requestId: "01980a12-3456-789a-8abc-def012345711",
      requestedAt: "2026-07-15T12:01:00.000Z",
    })).resolves.toMatchObject({ status: "WAITING_EXTERNAL" });
    expect([...item.repository.submissions.values()].map((value) => value.receipt?.action)).toEqual(["ISSUE"]);
  });

  it("resumes separate funding only after BE-15 reconciles each submitted action", async () => {
    const item = fixture();
    await expect(item.service.execute(context)).resolves.toMatchObject({ status: "WAITING_EXTERNAL" });
    const issue = [...item.repository.submissions.values()][0]!.receipt!;
    await expect(item.service.resumeAfterChainReconciliation(context, {
      action: "ISSUE", canonicalEventId: "stellar-event-issue", ledgerSequence: 1_000_001,
      outcome: "RECONCILED", transactionHash: issue.transactionHash,
    })).resolves.toMatchObject({ status: "WAITING_EXTERNAL" });
    const fund = [...item.repository.submissions.values()][1]!.receipt!;
    const completed = await item.service.resumeAfterChainReconciliation(context, {
      action: "FUND", canonicalEventId: "stellar-event-fund", ledgerSequence: 1_000_002,
      outcome: "RECONCILED", transactionHash: fund.transactionHash,
    });
    expect(completed).toMatchObject({ status: "COMPLETED", issuerReceipt: { status: "APPROVED" }, anchorReceipt: { status: "PAID" } });
  });

  it("fails terminally on a BE-15 reconciliation mismatch without compensating blindly", async () => {
    const item = fixture();
    await item.service.execute(context);
    const issue = [...item.repository.submissions.values()][0]!.receipt!;
    await expect(item.service.resumeAfterChainReconciliation(context, {
      action: "ISSUE", canonicalEventId: "stellar-event-mismatch", ledgerSequence: 1_000_001,
      outcome: "MISMATCH", transactionHash: issue.transactionHash,
    })).rejects.toMatchObject({ code: "PARTNER_REJECTED", retryable: false });
    await expect(new FacilityFundingCompensationService(item.repository, item.chain).execute(context)).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
  });

  it("keeps atomic issue-and-fund pending until its canonical event is reconciled", async () => {
    const item = fixture();
    await item.service.execute({ ...context, chainMode: "ATOMIC" });
    const receipt = [...item.repository.submissions.values()][0]?.receipt;
    expect(receipt).toMatchObject({ action: "ISSUE_AND_FUND", envelopeHash: "f".repeat(64), network: "TESTNET", sandbox: true, status: "SUBMITTED" });
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

  it("uses lookup before retry and never blindly resubmits a lost response", async () => {
    const timed = fixture("APPROVED", "TIMEOUT_THEN_SUCCESS");
    await expect(timed.service.execute(context)).rejects.toMatchObject({ code: "PARTNER_TIMEOUT", retryable: true });
    await expect(new FacilityFundingCompensationService(timed.repository, timed.chain).execute(context)).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
    await expect(timed.service.execute(context)).resolves.toMatchObject({ status: "WAITING_EXTERNAL" });
    expect([...timed.repository.submissions.values()].filter((value) => value.receipt !== undefined)).toHaveLength(1);

    const lost = fixture("APPROVED", "LOST_RESPONSE");
    await expect(lost.service.execute(context)).rejects.toMatchObject({ code: "PARTNER_TIMEOUT" });
    await expect(lost.service.execute(context)).resolves.toMatchObject({ status: "WAITING_EXTERNAL" });
    expect([...lost.repository.submissions.values()].map((value) => value.receipt?.action)).toEqual(["ISSUE"]);
  });

  it("does not compensate an issuance until canonical chain finality is known", async () => {
    const item = fixture("APPROVED", "FUND_REJECTED");
    await expect(item.service.execute(context)).resolves.toMatchObject({ status: "WAITING_EXTERNAL" });
    await expect(new FacilityFundingCompensationService(item.repository, item.chain).execute(context)).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
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
