import { describe, expect, it } from "vitest";

import { sandboxEvidenceDocumentReference } from "../src/modules/control/adapters/postgres-control-command-repository.js";

const input = {
  claimId: "019f6e1c-cc92-708a-a4ed-6e9e12adefee",
  evidenceHash: "a".repeat(64),
  tenantId: "019f6e1c-cc94-7507-abcd-ad43e1eeb9a5",
};

describe("sandbox evidence document references", () => {
  it("creates a deterministic non-secret locator for sandbox funding preconditions", () => {
    expect(sandboxEvidenceDocumentReference({ ...input, mode: "SANDBOX" })).toBe(
      `evidence://sandbox/${input.tenantId}/${input.claimId}/${input.evidenceHash}`,
    );
  });

  it("never fabricates a production evidence reference", () => {
    expect(sandboxEvidenceDocumentReference({ ...input, mode: "PRODUCTION" })).toBeUndefined();
  });
});
