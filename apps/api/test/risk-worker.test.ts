import { describe, expect, it, vi } from "vitest";

import { DeterministicRiskStub } from "../src/modules/risk/adapters/deterministic-stub.js";
import { RiskEvaluationWorkerService } from "../src/modules/risk/application/risk-evaluation-worker.js";
import { buildRiskEvaluationRequest } from "../src/modules/risk/domain/evaluation.js";
import type {
  RiskOperationJournal,
  RiskWorkClaim,
} from "../src/modules/risk/ports/durable-operation.js";

const tenantId = "0198a5ea-7c9c-7000-8000-000000000001";
const operationId = "0198a5ea-7c9c-7000-8000-000000000002";
const work = {
  operationId,
  tenantId,
  claimId: "0198a5ea-7c9c-7000-8000-000000000101",
  settlementStreamId: "0198a5ea-7c9c-7000-8000-000000000301",
  snapshotCutoffAt: "2026-07-15T00:00:00Z",
};

function prepared() {
  return {
    blocksAutomation: false,
    claimExpectedVersion: 2,
    request: buildRiskEvaluationRequest({
      requestId: operationId,
      claimId: work.claimId,
      claimKey: "a".repeat(64),
      sellerSubjectHash: "b".repeat(64),
      settlementStreamId: work.settlementStreamId,
      dataSnapshotHash: "c".repeat(64),
      snapshotCutoffAt: work.snapshotCutoffAt,
      sourceCurrency: "TIDR",
      features: { orderCount: 4 },
      grossUnsettled: { amountMinor: "10000", currency: "TIDR", scale: 2 },
      policyVersion: "sandbox-policy-v1",
    }),
  };
}

function journal(claim: RiskWorkClaim = { kind: "CLAIMED", attempt: 1, work }) {
  return {
    claim: vi.fn().mockResolvedValue(claim),
    markFailed: vi.fn().mockResolvedValue(undefined),
    recordAttempt: vi.fn().mockResolvedValue(undefined),
  } satisfies RiskOperationJournal;
}

describe("durable RISK worker", () => {
  it("retries outside a database transaction and commits one trusted result", async () => {
    const client = new DeterministicRiskStub({ mode: "TIMEOUT_THEN_SUCCESS" });
    const operationJournal = journal();
    const commit = vi.fn().mockResolvedValue(undefined);
    const service = new RiskEvaluationWorkerService(
      {
        client,
        committer: { commit },
        inputProvider: { prepare: vi.fn().mockResolvedValue(prepared()) },
        journal: operationJournal,
      },
      { maxAttempts: 2, sleep: vi.fn().mockResolvedValue(undefined) },
    );

    const result = await service.run({ operationId, tenantId });

    expect(result.status).toBe("SUCCEEDED");
    expect(client.attempts).toBe(2);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(operationJournal.recordAttempt).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ safeErrorClass: "PARTNER_TIMEOUT", status: "RETRYABLE_FAILURE" }),
    );
    expect(operationJournal.recordAttempt).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ status: "SUCCESS" }),
    );
    const attempt = operationJournal.recordAttempt.mock.calls[0]?.[0];
    expect(attempt).not.toHaveProperty("features");
    expect(attempt).toHaveProperty("requestHash");
  });

  it("returns completed replay without calling RISK", async () => {
    const client = new DeterministicRiskStub();
    const service = new RiskEvaluationWorkerService({
      client,
      committer: { commit: vi.fn() },
      inputProvider: { prepare: vi.fn() },
      journal: journal({ kind: "COMPLETED" }),
    });

    await expect(service.run({ operationId, tenantId })).resolves.toEqual({ status: "COMPLETED" });
    expect(client.attempts).toBe(0);
  });

  it("durably classifies a terminal protocol failure", async () => {
    const operationJournal = journal();
    const service = new RiskEvaluationWorkerService({
      client: new DeterministicRiskStub({ mode: "IDENTITY_MISMATCH" }),
      committer: { commit: vi.fn() },
      inputProvider: { prepare: vi.fn().mockResolvedValue(prepared()) },
      journal: operationJournal,
    });

    await expect(service.run({ operationId, tenantId })).rejects.toMatchObject({
      code: "PARTNER_REJECTED",
    });
    expect(operationJournal.markFailed).toHaveBeenCalledWith(
      expect.objectContaining({ retryable: false, safeErrorClass: "PARTNER_REJECTED" }),
    );
  });
});
