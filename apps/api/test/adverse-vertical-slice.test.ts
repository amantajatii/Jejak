import { describe, expect, it } from "vitest";

import {
  AdverseHttpClient,
  adverseKey,
  expectHttpFailure,
  fraction,
  pollWorkspace,
  sourceHash,
  uuidV7Like,
  zero,
  type Workspace,
} from "./helpers/adverse-http.js";

const baseUrl = process.env.JEJAK_ADVERSE_API_BASE_URL?.replace(/\/$/, "");
const mutationAllowed = process.env.JEJAK_ADVERSE_ALLOW_MUTATION === "true";
const liveRuntimeAvailable = baseUrl !== undefined && mutationAllowed;

describe.sequential("P1-09 adverse vertical slice through public HTTP", () => {
  it.runIf(liveRuntimeAvailable)("reaches reconciled CLOSED_WITH_LOSS and rejects unsafe adverse operations", async (testContext) => {
    const client = new AdverseHttpClient(baseUrl!);
    const resetKey = adverseKey("reset-adverse");
    const context = await client.reset(resetKey);
    expect(context).toMatchObject({ chainMode: expect.stringMatching(/^(TESTNET|DETERMINISTIC)$/), claimState: "FUNDED", scenario: "ADVERSE" });
    if (context.chainMode === "TESTNET" && process.env.JEJAK_ADVERSE_ALLOW_TESTNET_MUTATION !== "true") {
      testContext.skip("Testnet mutation is not authorized; set JEJAK_ADVERSE_ALLOW_TESTNET_MUTATION=true only after explicit approval.");
    }

    const originator = await client.createSession(context.tenantId, "ORIGINATOR");
    const initial = await client.workspace({ claimId: context.claimId, tenantId: context.tenantId, token: originator.accessToken });
    expect(initial.checkpoint).toMatchObject({ version: context.version });
    expect(initial.claim).toMatchObject({ id: context.claimId, state: "FUNDED", tenantId: context.tenantId, version: context.version });
    expect(initial.facilityPosition).not.toBeNull();
    expect(initial.timeline.some((item) => item.eventType === "demo.prerequisites.seeded")).toBe(true);
    expect(initial.stellarReferences).toHaveLength(0);
    assertSafeWorkspace(initial);

    const baselineEsv = BigInt(initial.claim.eligibleSettlementValue.amountMinor);
    const baselineSds = initial.latestAttestation?.sdsBps;
    if (baselineSds === undefined) {
      throw new Error("NEEDS_INTEGRATION_FIX: the public seed-originated FUNDED workspace does not expose a reconciled baseline SDS, so P1-09 cannot prove that SDS increased without fabricating a baseline.");
    }

    const refundKey = adverseKey("refund-spike");
    const refund = await client.request<{ claimId: string; eventId: string; operationId: string; status: "QUEUED"; version: number }>(
      "POST",
      `/v1/demo/claims/${context.claimId}/refund-spike`,
      { body: {}, idempotencyKey: refundKey, ifMatch: initial.checkpoint.version, tenantId: context.tenantId, token: originator.accessToken },
    );
    expect(refund).toMatchObject({ claimId: context.claimId, status: "QUEUED" });

    const replay = await client.request<typeof refund>("POST", `/v1/demo/claims/${context.claimId}/refund-spike`, {
      body: {}, idempotencyKey: refundKey, ifMatch: initial.checkpoint.version, tenantId: context.tenantId, token: originator.accessToken,
    });
    expect(replay).toMatchObject({ eventId: refund.eventId, operationId: refund.operationId });

    await expect(client.request("POST", `/v1/demo/claims/${context.claimId}/refund-spike`, {
      body: {}, idempotencyKey: adverseKey("refund-stale"), ifMatch: initial.checkpoint.version, tenantId: context.tenantId, token: originator.accessToken,
    })).rejects.toSatisfy((error: unknown) => expectHttpFailure(error, [412], ["VERSION_CONFLICT"]));

    const afterRefund = await client.workspace({ claimId: context.claimId, tenantId: context.tenantId, token: originator.accessToken });
    await expect(client.request("POST", `/v1/demo/claims/${context.claimId}/refund-spike`, {
      body: {}, idempotencyKey: adverseKey("refund-duplicate"), ifMatch: afterRefund.checkpoint.version, tenantId: context.tenantId, token: originator.accessToken,
    })).rejects.toSatisfy((error: unknown) => expectHttpFailure(error, [409], ["IDEMPOTENCY_CONFLICT", "SETTLEMENT_DUPLICATE"]));

    if (afterRefund.latestAttestation?.id === initial.latestAttestation?.id) {
      expect(afterRefund.claim.state).toBe("FUNDED");
      expect(afterRefund.pendingOperation?.kind).toBe("RISK_EVALUATION");
    }
    const reevaluated = await pollWorkspace(
      client,
      { claimId: context.claimId, tenantId: context.tenantId, token: originator.accessToken },
      (workspace) => workspace.latestAttestation !== null && workspace.latestAttestation.id !== initial.latestAttestation?.id && workspace.claim.state === "PAUSED",
    );
    expect(BigInt(reevaluated.claim.eligibleSettlementValue.amountMinor)).toBeLessThan(baselineEsv);
    expect(reevaluated.latestAttestation!.sdsBps).toBeGreaterThan(baselineSds);
    expect(reevaluated.latestAttestation!.reasonCodes).toContain("HIGH_REFUND_RATE");
    expect(reevaluated.timeline.some((item) => item.eventType === "marketplace.refund_spike")).toBe(true);
    assertSafeWorkspace(reevaluated);

    const servicer = await client.createSession(context.tenantId, "SERVICER");
    const settlementAmount = fraction(reevaluated.claim.outstandingPrincipal, 3n, 4n);
    const externalEventId = adverseKey("insufficient-settlement");
    const settlement = await client.request<{ id: string }>("POST", "/v1/settlement-events", {
      body: {
        amount: settlementAmount,
        claimId: context.claimId,
        eventType: "SETTLEMENT",
        externalEventId,
        occurredAt: new Date().toISOString(),
        source: "JEJAK_P1_09",
        sourceHash: sourceHash({ claimId: context.claimId, externalEventId, settlementAmount }),
      },
      idempotencyKey: adverseKey("settlement-ingest"), tenantId: context.tenantId, token: servicer.accessToken,
    });
    expect(settlement.id).toEqual(expect.any(String));

    let workspace = await client.workspace({ claimId: context.claimId, tenantId: context.tenantId, token: servicer.accessToken });
    await client.request("POST", `/v1/claims/${context.claimId}/reconcile`, {
      body: { through: new Date(Date.now() + 1_000).toISOString() }, idempotencyKey: adverseKey("settlement-reconcile"),
      ifMatch: workspace.checkpoint.version, tenantId: context.tenantId, token: servicer.accessToken,
    });
    workspace = await client.workspace({ claimId: context.claimId, tenantId: context.tenantId, token: servicer.accessToken });

    const waterfallKey = adverseKey("final-waterfall");
    const waterfall = await client.request<{ id: string; replayed: boolean; status: string }>("POST", `/v1/claims/${context.claimId}/waterfall`, {
      body: { finalSettlement: true, financingFeeDue: zero(settlementAmount), servicingFeeDue: zero(settlementAmount), settlementEventId: settlement.id },
      idempotencyKey: waterfallKey, ifMatch: workspace.checkpoint.version, tenantId: context.tenantId, token: servicer.accessToken,
    });
    const waterfallReplay = await client.request<typeof waterfall>("POST", `/v1/claims/${context.claimId}/waterfall`, {
      body: { finalSettlement: true, financingFeeDue: zero(settlementAmount), servicingFeeDue: zero(settlementAmount), settlementEventId: settlement.id },
      idempotencyKey: waterfallKey, ifMatch: workspace.checkpoint.version, tenantId: context.tenantId, token: servicer.accessToken,
    });
    expect(waterfallReplay.id).toBe(waterfall.id);
    expect(waterfallReplay.replayed).toBe(true);

    const shortfall = await pollWorkspace(
      client,
      { claimId: context.claimId, tenantId: context.tenantId, token: servicer.accessToken },
      (candidate) => candidate.claim.state === "SHORTFALL" && candidate.latestWaterfall !== null,
    );
    assertWaterfallConservation(shortfall, reevaluated.claim.outstandingPrincipal.amountMinor);
    expect(BigInt(shortfall.latestWaterfall!.firstLossApplied.amountMinor)).toBeGreaterThan(0n);
    expect(BigInt(shortfall.latestWaterfall!.seniorLoss.amountMinor)).toBeGreaterThan(0n);

    const resolver = await client.createSession(context.tenantId, "RESOLVER");
    await expect(client.request("POST", `/v1/claims/${context.claimId}/resolution`, {
      body: { action: "OPEN", reasonCodes: ["SETTLEMENT_SHORTFALL"] }, idempotencyKey: adverseKey("unauthorized-resolution"),
      ifMatch: shortfall.checkpoint.version, tenantId: context.tenantId, token: originator.accessToken,
    })).rejects.toSatisfy((error: unknown) => expectHttpFailure(error, [403], ["FORBIDDEN"]));

    await expect(client.request("POST", `/v1/claims/${context.claimId}/resolution`, {
      body: { action: "OPEN", reasonCodes: ["SETTLEMENT_SHORTFALL"] }, idempotencyKey: adverseKey("wrong-tenant"),
      ifMatch: shortfall.checkpoint.version, tenantId: uuidV7Like(), token: resolver.accessToken,
    })).rejects.toSatisfy((error: unknown) => expectHttpFailure(error, [401, 403], ["AUTH_REQUIRED", "FORBIDDEN"]));

    await expect(client.request("POST", `/v1/claims/${uuidV7Like()}/resolution`, {
      body: { action: "OPEN", reasonCodes: ["SETTLEMENT_SHORTFALL"] }, idempotencyKey: adverseKey("missing-assignment"),
      ifMatch: shortfall.checkpoint.version, tenantId: context.tenantId, token: resolver.accessToken,
    })).rejects.toSatisfy((error: unknown) => expectHttpFailure(error, [403], ["FORBIDDEN"]));

    await client.request("POST", `/v1/claims/${context.claimId}/resolution`, {
      body: { action: "OPEN", reasonCodes: ["SETTLEMENT_SHORTFALL"] }, idempotencyKey: adverseKey("resolution-open"),
      ifMatch: shortfall.checkpoint.version, tenantId: context.tenantId, token: resolver.accessToken,
    });
    workspace = await client.workspace({ claimId: context.claimId, tenantId: context.tenantId, token: resolver.accessToken });
    await expect(client.request("POST", `/v1/claims/${context.claimId}/resolution`, {
      body: { action: "UPDATE", reasonCodes: ["SETTLEMENT_SHORTFALL"], recoveryRealized: zero(shortfall.latestWaterfall!.seniorLoss) },
      idempotencyKey: adverseKey("resolution-stale"), ifMatch: shortfall.checkpoint.version, tenantId: context.tenantId, token: resolver.accessToken,
    })).rejects.toSatisfy((error: unknown) => expectHttpFailure(error, [412], ["VERSION_CONFLICT"]));

    await client.request("POST", `/v1/claims/${context.claimId}/resolution`, {
      body: { action: "UPDATE", evidenceHashes: [sourceHash({ claimId: context.claimId, kind: "RECOVERY_RECORD" })], reasonCodes: ["SETTLEMENT_SHORTFALL"], recoveryRealized: zero(shortfall.latestWaterfall!.seniorLoss) },
      idempotencyKey: adverseKey("resolution-recovery"), ifMatch: workspace.checkpoint.version, tenantId: context.tenantId, token: resolver.accessToken,
    });
    workspace = await client.workspace({ claimId: context.claimId, tenantId: context.tenantId, token: resolver.accessToken });
    const closeKey = adverseKey("resolution-close");
    await expect(client.request("POST", `/v1/claims/${context.claimId}/resolution`, {
      body: { action: "CLOSE", evidenceHashes: [sourceHash({ claimId: context.claimId, kind: "FINAL_LOSS_RECORD" })], reasonCodes: ["SETTLEMENT_SHORTFALL"] },
      idempotencyKey: closeKey, ifMatch: workspace.checkpoint.version, tenantId: context.tenantId, token: resolver.accessToken,
    })).rejects.toSatisfy((error: unknown) => expectHttpFailure(error, [409], ["INVALID_STATE_TRANSITION"]));

    const servicerBeforeClose = await client.workspace({ claimId: context.claimId, tenantId: context.tenantId, token: servicer.accessToken });
    await client.request("POST", `/v1/claims/${context.claimId}/reconcile`, {
      body: { through: new Date(Date.now() + 2_000).toISOString() }, idempotencyKey: adverseKey("resolution-reconcile"),
      ifMatch: servicerBeforeClose.checkpoint.version, tenantId: context.tenantId, token: servicer.accessToken,
    });
    workspace = await client.workspace({ claimId: context.claimId, tenantId: context.tenantId, token: resolver.accessToken });
    await client.request("POST", `/v1/claims/${context.claimId}/resolution`, {
      body: { action: "CLOSE", evidenceHashes: [sourceHash({ claimId: context.claimId, kind: "FINAL_LOSS_RECORD" })], reasonCodes: ["SETTLEMENT_SHORTFALL"] },
      idempotencyKey: closeKey, ifMatch: workspace.checkpoint.version, tenantId: context.tenantId, token: resolver.accessToken,
    });

    const closed = await pollWorkspace(
      client,
      { claimId: context.claimId, tenantId: context.tenantId, token: resolver.accessToken },
      (candidate) => candidate.claim.state === "CLOSED_WITH_LOSS" && candidate.resolutionCase?.status === "WRITTEN_OFF",
    );
    expect(closed.pendingOperation).toBeNull();
    expect(closed.resolutionCase!.finalLoss.amountMinor).toBe(shortfall.latestWaterfall!.seniorLoss.amountMinor);
    expect(closed.timeline.some((item) => item.eventType === "resolution.closed")).toBe(true);
    expect(closed.stellarReferences.some((reference) => reference.status === "RECONCILED")).toBe(true);
    assertSafeWorkspace(closed);
    assertCanonicalStellarReferences(closed);

    const restoredContext = await client.request<{ claimId: string; claimState: string; tenantId: string; version: number }>("GET", "/v1/demo/context", { tenantId: context.tenantId });
    const restoredWorkspace = await client.workspace({ claimId: context.claimId, tenantId: context.tenantId, token: resolver.accessToken });
    expect(restoredContext).toMatchObject({ claimId: context.claimId, claimState: "CLOSED_WITH_LOSS", tenantId: context.tenantId, version: restoredWorkspace.checkpoint.version });
    expect(restoredWorkspace).toEqual(closed);
  }, 300_000);

  it.skip("reconciliation mismatch requires a public, canonical sandbox failure-injection operation from Session 4; no such operation exists in the frozen contract", () => undefined);
  it.skip("process-restart restoration must be run by final verification orchestration; this parallel session is forbidden from restarting the shared runtime", () => undefined);
});

function assertWaterfallConservation(workspace: Workspace, initialOutstanding: string): void {
  const waterfall = workspace.latestWaterfall!;
  const input = BigInt(waterfall.inputSettlement.amountMinor);
  const cash = BigInt(waterfall.principalPaid.amountMinor) + BigInt(waterfall.feesPaid.amountMinor) + BigInt(waterfall.sellerResidual.amountMinor);
  expect(cash).toBe(input);
  const gap = BigInt(initialOutstanding) - BigInt(waterfall.principalPaid.amountMinor);
  const allocatedLoss = BigInt(waterfall.firstLossApplied.amountMinor) + BigInt(waterfall.seniorLoss.amountMinor);
  expect(allocatedLoss).toBe(gap);
}

function assertCanonicalStellarReferences(workspace: Workspace): void {
  for (const reference of workspace.stellarReferences) {
    expect(reference.network).toBe(workspace.chainMode);
    if (reference.status === "RECONCILED") expect(reference.transactionHash).toMatch(/^[0-9a-f]{64}$/);
    if (workspace.chainMode === "TESTNET" && reference.explorerUrl !== undefined) expect(reference.explorerUrl).toMatch(/^https:\/\//);
    if (workspace.chainMode === "DETERMINISTIC") expect(reference.explorerUrl).toBeUndefined();
  }
}

function assertSafeWorkspace(workspace: Workspace): void {
  const serialized = JSON.stringify(workspace);
  expect(serialized).not.toMatch(/documentSecretRef|accessToken|bearer|signedUrl|privateKey|seedPhrase|rawPartner|evidenceBytes|bankAccount|emailAddress|phoneNumber/i);
  for (const value of moneyValues(workspace)) {
    expect(value.amountMinor).toMatch(/^-?(0|[1-9][0-9]*)$/);
    expect(value.scale).toEqual(expect.any(Number));
    expect(Number.isInteger(value.scale)).toBe(true);
  }
}

function moneyValues(workspace: Workspace) {
  return [
    workspace.claim.grossUnsettled,
    workspace.claim.eligibleSettlementValue,
    workspace.claim.outstandingPrincipal,
    ...(workspace.latestWaterfall === null ? [] : [
      workspace.latestWaterfall.inputSettlement, workspace.latestWaterfall.principalPaid, workspace.latestWaterfall.feesPaid,
      workspace.latestWaterfall.firstLossApplied, workspace.latestWaterfall.seniorLoss, workspace.latestWaterfall.sellerResidual,
    ]),
    ...(workspace.resolutionCase === null ? [] : [workspace.resolutionCase.finalLoss, workspace.resolutionCase.recoveryRealized]),
  ];
}
