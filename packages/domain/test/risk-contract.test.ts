import { describe, expect, it } from "vitest";

import { createValidator } from "../scripts/validate-schemas.mjs";

const requestSchemaId =
  "https://jejak.finance/schemas/risk/evaluation-request.schema.json";
const responseSchemaId =
  "https://jejak.finance/schemas/risk/evaluation-response.schema.json";

const money = { amountMinor: "10000", currency: "TIDR", scale: 2 };
const request = {
  requestId: "request-001",
  claimId: "0198a5ea-7c9c-7000-8000-000000000101",
  claimKey: "a".repeat(64),
  sellerSubjectHash: "b".repeat(64),
  settlementStreamId: "0198a5ea-7c9c-7000-8000-000000000301",
  dataSnapshotHash: "c".repeat(64),
  snapshotCutoffAt: "2026-07-15T00:00:00Z",
  sourceCurrency: "TIDR",
  features: { orderCount: 1, hasPayoutHistory: true },
  featureSnapshotHash: "d".repeat(64),
  grossUnsettled: money,
  policyVersion: "sandbox-policy-v1",
};

describe("RISK evaluation contract", () => {
  it("accepts a request and identity-echoing response", () => {
    const ajv = createValidator();
    const validateRequest = ajv.getSchema(requestSchemaId);
    const validateResponse = ajv.getSchema(responseSchemaId);

    expect(validateRequest?.(request), validateRequest?.errors ?? []).toBe(true);
    expect(
      validateResponse?.({
        requestId: request.requestId,
        claimId: request.claimId,
        dataSnapshotHash: request.dataSnapshotHash,
        policyVersion: request.policyVersion,
        evaluationId: "0198a5ea-7c9c-7000-8000-000000000401",
        modelId: "sandbox-risk",
        modelVersion: "v1",
        decision: "ELIGIBLE",
        sdsBps: 2000,
        expectedDilutionBps: 2000,
        tailDilutionBps: 3000,
        eligibleSettlementValue: { ...money, amountMinor: "8000" },
        maxAdvanceAmount: { ...money, amountMinor: "6400" },
        reasonCodes: [],
        featureSnapshotHash: request.featureSnapshotHash,
        evaluatedAt: "2026-07-15T00:00:01Z",
      }),
      validateResponse?.errors ?? [],
    ).toBe(true);
  });

  it("rejects a response that cannot echo snapshot identity", () => {
    const validateResponse = createValidator().getSchema(responseSchemaId);
    const incomplete = {
      evaluationId: "0198a5ea-7c9c-7000-8000-000000000401",
      modelId: "sandbox-risk",
      modelVersion: "v1",
      decision: "ELIGIBLE",
      sdsBps: 2000,
      expectedDilutionBps: 2000,
      tailDilutionBps: 3000,
      eligibleSettlementValue: money,
      maxAdvanceAmount: money,
      reasonCodes: [],
      featureSnapshotHash: request.featureSnapshotHash,
      evaluatedAt: "2026-07-15T00:00:01Z",
    };

    expect(validateResponse?.(incomplete)).toBe(false);
  });
});
