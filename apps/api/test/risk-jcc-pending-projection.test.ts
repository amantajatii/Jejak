import { describe, expect, it } from "vitest";

import { projectRiskJccPendingOperation } from "../src/modules/risk/adapters/postgres-pending-projection.js";

describe("safe RISK/JCC pending projection", () => {
  it("maps retryable partner failures without exposing raw context", () => {
    const projected = projectRiskJccPendingOperation({
      id: "operation-1", kind: "JCC_REGISTER", status: "RETRYABLE",
      context: { safeErrorClass: "PARTNER_TIMEOUT", secret: "must-not-project" },
      createdAt: new Date("2026-07-15T00:00:00Z"), updatedAt: new Date("2026-07-15T00:01:00Z"),
    });
    expect(projected).toEqual({
      id: "operation-1", kind: "JCC_REGISTRATION", status: "RETRYABLE_FAILURE", retryable: true,
      reasonCodes: ["PARTNER_UNAVAILABLE"], submittedAt: "2026-07-15T00:00:00.000Z",
      updatedAt: "2026-07-15T00:01:00.000Z",
    });
    expect(JSON.stringify(projected)).not.toContain("must-not-project");
  });

  it("omits completed operations and maps terminal mismatches safely", () => {
    const base = {
      id: "operation-2", kind: "RISK_EVALUATION", context: { safeErrorClass: "PARTNER_REJECTED" },
      createdAt: new Date("2026-07-15T00:00:00Z"), updatedAt: new Date("2026-07-15T00:01:00Z"),
    };
    expect(projectRiskJccPendingOperation({ ...base, status: "COMPLETED" })).toBeNull();
    expect(projectRiskJccPendingOperation({ ...base, status: "FAILED" })).toMatchObject({
      status: "TERMINAL_FAILURE", retryable: false, reasonCodes: ["DATA_INCONSISTENT"],
    });
  });
});
