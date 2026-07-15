import { describe, expect, it } from "vitest";

import { loadSchemas } from "../scripts/schema-registry.mjs";
import { createValidator } from "../scripts/validate-schemas.mjs";

const entityNames = [
  "seller", "marketplace-connection", "settlement-stream", "claim",
  "eligibility-attestation", "control-evidence", "financing-offer",
  "facility-position", "settlement-event", "waterfall-result", "resolution-case",
];

describe("canonical entities", () => {
  it("publishes exactly the required entity schemas", () => {
    const entityPaths = loadSchemas()
      .filter(({ relativePath }) => relativePath.startsWith("entities/"))
      .map(({ relativePath }) => relativePath.replace("entities/", "").replace(".schema.json", ""));

    expect(entityPaths.sort()).toEqual([...entityNames].sort());
  });

  it("compiles every entity through the shared registry", () => {
    expect(() => createValidator()).not.toThrow();
  });

  it("does not introduce raw PII, bank, KYC, or legal document properties", () => {
    const serialized = JSON.stringify(
      loadSchemas()
        .filter(({ relativePath }) => relativePath.startsWith("entities/"))
        .map(({ schema }) => schema),
    );

    for (const forbidden of ["bankAccount", "kycData", "legalDocument", "rawOrders"]) {
      expect(serialized).not.toContain(`\"${forbidden}\"`);
    }
  });
});
