import { describe, expect, it } from "vitest";

import { loadSchemas } from "../scripts/schema-registry.mjs";

const expectedClaimStates = [
  "DRAFT", "DATA_PENDING", "ANALYZED", "ELIGIBLE", "CONTROLLED", "ISSUED",
  "FUNDED", "SETTLING", "REPAID", "REDEEMED", "CLOSED", "SHORTFALL",
  "RESOLUTION", "CLOSED_WITH_LOSS", "REVIEW", "REJECTED", "FROZEN",
  "SUSPENDED", "PAUSED", "CANCELLED",
];

describe("canonical enums", () => {
  it("keeps the frozen ClaimState values in canonical order", () => {
    const schema = loadSchemas().find(
      ({ relativePath }) => relativePath === "enums/claim-state.schema.json",
    )?.schema;

    expect(schema?.enum).toEqual(expectedClaimStates);
  });
});
