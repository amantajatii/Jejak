import { describe, expect, it, vi } from "vitest";

import type { JccApplicationService } from "../src/modules/jcc/application/jcc-service.js";
import { JccRiskPostEvaluationLifecycle } from "../src/modules/risk/application/jcc-lifecycle.js";
import type { TrustedRiskEvaluation } from "../src/modules/risk/domain/evaluation.js";

const evaluation: TrustedRiskEvaluation = {
  requestId: "0198a5ea-7c9c-7000-8000-000000000002",
  claimId: "0198a5ea-7c9c-7000-8000-000000000101",
  dataSnapshotHash: "a".repeat(64), policyVersion: "policy-v1",
  evaluationId: "0198a5ea-7c9c-7000-8000-000000000401",
  modelId: "risk", modelVersion: "1", decision: "ELIGIBLE", effectiveDecision: "ELIGIBLE",
  sdsBps: 800, expectedDilutionBps: 500, tailDilutionBps: 1000,
  eligibleSettlementValue: { amountMinor: "8000", currency: "TIDR", scale: 2 },
  maxAdvanceAmount: { amountMinor: "6400", currency: "TIDR", scale: 2 },
  reasonCodes: [], effectiveReasonCodes: [], featureSnapshotHash: "b".repeat(64),
  evaluatedAt: "2026-07-15T00:00:00.987Z",
};

describe("RISK to canonical JCC lifecycle", () => {
  it("uses stable identities across restart and activates only after JCC is ACTIVE", async () => {
    const issue = vi.fn().mockResolvedValue({ operationalStatus: "ACTIVE" });
    const activate = vi.fn().mockResolvedValue(undefined);
    const input = { claimExpectedVersion: 2, evaluation, operationId: evaluation.requestId, tenantId: "tenant-1" };
    const options = { network: "TESTNET", oracle: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", ttlMs: 86_400_000 };
    await new JccRiskPostEvaluationLifecycle({ activator: { activate }, jcc: { issue } as unknown as JccApplicationService }, options).continue(input);
    await new JccRiskPostEvaluationLifecycle({ activator: { activate }, jcc: { issue } as unknown as JccApplicationService }, options).continue(input);

    expect(issue.mock.calls[0]?.[0]).toEqual(issue.mock.calls[1]?.[0]);
    expect(issue.mock.calls[0]?.[0]).toMatchObject({
      issuedAt: "2026-07-15T00:00:00Z", expiresAt: "2026-07-16T00:00:00Z", network: "TESTNET",
    });
    expect(activate).toHaveBeenCalledTimes(2);
  });

  it("does not activate a claim while registry state is pending", async () => {
    const activate = vi.fn();
    const lifecycle = new JccRiskPostEvaluationLifecycle({
      activator: { activate },
      jcc: { issue: vi.fn().mockResolvedValue({ operationalStatus: "PENDING_REGISTRATION" }) } as unknown as JccApplicationService,
    }, { network: "TESTNET", oracle: "oracle", ttlMs: 1_000 });
    await expect(lifecycle.continue({
      claimExpectedVersion: 2, evaluation, operationId: evaluation.requestId, tenantId: "tenant-1",
    })).rejects.toMatchObject({ code: "PARTNER_TIMEOUT", retryable: true });
    expect(activate).not.toHaveBeenCalled();
  });
});
