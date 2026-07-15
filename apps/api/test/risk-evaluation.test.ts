import { describe, expect, it, vi } from "vitest";

import { DeterministicRiskStub } from "../src/modules/risk/adapters/deterministic-stub.js";
import {
  evaluateWithRetry,
  HttpRiskAttestationClient,
  HttpRiskEvaluationClient,
} from "../src/modules/risk/adapters/http-client.js";
import {
  buildRiskEvaluationRequest,
  validateRiskEvaluation,
} from "../src/modules/risk/domain/evaluation.js";
import { orchestrateRiskEvaluation } from "../src/modules/risk/application/orchestrate-evaluation.js";
import { responseForAttestation } from "../src/modules/risk/application/risk-evaluation-worker.js";

const gross = { amountMinor: "10000", currency: "TIDR", scale: 2 };

function request(features: Record<string, string | number | boolean | null> = {}) {
  return buildRiskEvaluationRequest({
    requestId: "request-1",
    claimId: "0198a5ea-7c9c-7000-8000-000000000101",
    claimKey: "a".repeat(64),
    sellerSubjectHash: "b".repeat(64),
    settlementStreamId: "0198a5ea-7c9c-7000-8000-000000000301",
    dataSnapshotHash: "c".repeat(64),
    snapshotCutoffAt: "2026-07-15T00:00:00Z",
    sourceCurrency: "TIDR",
    features,
    grossUnsettled: gross,
    policyVersion: "sandbox-policy-v1",
  });
}

describe("RISK evaluation validation", () => {
  it("reconciles every identity and Money invariant", async () => {
    const evaluationRequest = request({ orderCount: 1 });
    const response = await new DeterministicRiskStub().evaluate(evaluationRequest);
    const trusted = validateRiskEvaluation(evaluationRequest, response, {
      blocksAutomation: false,
    });

    expect(trusted).toMatchObject({
      effectiveDecision: "ELIGIBLE",
      eligibleSettlementValue: { amountMinor: "8000" },
      maxAdvanceAmount: { amountMinor: "6400" },
    });
  });

  it("overrides eligibility when ingestion quality blocks automation", async () => {
    const evaluationRequest = request({ orderCount: 1 });
    const response = await new DeterministicRiskStub().evaluate(evaluationRequest);
    const trusted = validateRiskEvaluation(evaluationRequest, response, {
      blocksAutomation: true,
    });
    expect(trusted.effectiveDecision).toBe("REVIEW");
    expect(trusted.effectiveReasonCodes).toContain("MANUAL_REVIEW_REQUIRED");
  });

  it("rejects mismatched snapshot identity as terminal", async () => {
    const evaluationRequest = request({ orderCount: 1 });
    const response = await new DeterministicRiskStub({ mode: "IDENTITY_MISMATCH" }).evaluate(
      evaluationRequest,
    );
    expect(() =>
      validateRiskEvaluation(evaluationRequest, response, { blocksAutomation: false }),
    ).toThrow(/identity does not match/);
  });

  it("retries classified timeouts and converges once", async () => {
    const stub = new DeterministicRiskStub({ mode: "TIMEOUT_THEN_SUCCESS" });
    const sleep = vi.fn().mockResolvedValue(undefined);
    const response = await evaluateWithRetry(stub, request(), { maxAttempts: 2, sleep });
    expect(response.decision).toBe("ELIGIBLE");
    expect(stub.attempts).toBe(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it("commits exactly one trusted result after retry convergence", async () => {
    const stub = new DeterministicRiskStub({ mode: "TIMEOUT_THEN_SUCCESS" });
    const commit = vi.fn().mockResolvedValue(undefined);
    const trusted = await orchestrateRiskEvaluation({
      request: request(),
      client: stub,
      committer: { commit },
      claimExpectedVersion: 2,
      blocksAutomation: false,
      maxAttempts: 2,
      sleep: async () => undefined,
    });
    expect(trusted.effectiveDecision).toBe("ELIGIBLE");
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith(
      expect.objectContaining({ claimExpectedVersion: 2 }),
    );
  });

  it("persists the signed attestation together with the trusted evaluation", async () => {
    const evaluationRequest = request();
    const response = await new DeterministicRiskStub().evaluate(evaluationRequest);
    const commit = vi.fn().mockResolvedValue(undefined);
    await orchestrateRiskEvaluation({
      request: evaluationRequest,
      client: { evaluate: async () => response },
      committer: { commit },
      claimExpectedVersion: 2,
      blocksAutomation: false,
      maxAttempts: 1,
      sleep: async () => undefined,
      attest: async () => ({
        id: "0198a5ea-7c9c-7000-8000-000000000201",
        attestationKey: "d".repeat(64), claimId: evaluationRequest.claimId,
        claimKey: evaluationRequest.claimKey, sellerSubjectHash: evaluationRequest.sellerSubjectHash,
        settlementStreamId: evaluationRequest.settlementStreamId, dataSnapshotHash: evaluationRequest.dataSnapshotHash,
        modelId: response.modelId, modelVersion: response.modelVersion, policyVersion: response.policyVersion,
        decision: response.decision, sdsBps: response.sdsBps, grossUnsettled: gross,
        eligibleSettlementValue: response.eligibleSettlementValue, maxAdvanceAmount: response.maxAdvanceAmount,
        reasonCodes: response.reasonCodes, issuedAt: "2026-07-15T00:00:00Z", expiresAt: "2026-07-16T00:00:00Z",
        keyId: "sandbox-key", signature: "signature", status: "ACTIVE",
      }),
    });
    expect(commit).toHaveBeenCalledWith(expect.objectContaining({
      attestation: expect.objectContaining({ id: "0198a5ea-7c9c-7000-8000-000000000201" }),
    }));
  });

  it("builds a JCC payload from the effective REVIEW decision when automation is blocked", async () => {
    const evaluationRequest = request();
    const response = await new DeterministicRiskStub().evaluate(evaluationRequest);
    const trusted = await orchestrateRiskEvaluation({
      request: evaluationRequest, client: { evaluate: async () => response }, committer: { commit: async () => undefined },
      claimExpectedVersion: 2, blocksAutomation: true, maxAttempts: 1, sleep: async () => undefined,
    });
    expect(responseForAttestation(trusted)).toMatchObject({
      decision: "REVIEW", reasonCodes: expect.arrayContaining(["MANUAL_REVIEW_REQUIRED"]),
    });
  });
});

describe("RISK HTTP client", () => {
  it("classifies 503 without exposing response content", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      headers: new Headers(),
      text: async () => "sensitive upstream body",
    });
    const client = new HttpRiskEvaluationClient({
      baseUrl: "http://risk.internal",
      workloadToken: "secret-token",
      fetch: fetchMock,
    });
    const failure = client.evaluate(request());
    await expect(failure).rejects.toMatchObject({
      code: "PARTNER_TIMEOUT",
      retryable: true,
    });
    await failure.catch((error: unknown) => {
      expect(String(error)).not.toMatch(/sensitive|secret-token/);
    });
  });

  it("rejects invalid JSON as a terminal protocol failure", async () => {
    const client = new HttpRiskEvaluationClient({
      baseUrl: "http://risk.internal",
      workloadToken: "secret-token",
      fetch: vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        text: async () => "not-json",
      }),
    });
    await expect(client.evaluate(request())).rejects.toMatchObject({
      code: "PARTNER_REJECTED",
      retryable: false,
    });
  });

  it("does not send an empty bearer token to the attestation endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200, headers: new Headers(),
      text: async () => JSON.stringify({ id: "attestation", attestationKey: "key", keyId: "key", signature: "sig", status: "ACTIVE", expiresAt: "2026-07-16T00:00:00Z" }),
    });
    const client = new HttpRiskAttestationClient({ baseUrl: "http://risk.internal", fetch: fetchMock });
    await client.attest({
      request: request(), evaluation: await new DeterministicRiskStub().evaluate(request()),
      attestationId: "0198a5ea-7c9c-7000-8000-000000000201",
      issuedAt: "2026-07-15T00:00:00Z", expiresAt: "2026-07-16T00:00:00Z",
    });
    expect(fetchMock.mock.calls[0]?.[1]?.headers).not.toHaveProperty("authorization");
  });
});
