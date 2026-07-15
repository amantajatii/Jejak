import { describe, expect, it } from "vitest";

import { validateFixtures, validateWorkspaceFixtures } from "../scripts/validate-fixtures.mjs";

describe("shared scenario fixtures", () => {
  it("validates all eight deterministic sandbox scenarios", () => {
    expect(validateFixtures()).toHaveLength(8);
  });

  it("validates the happy and adverse ClaimWorkspace handoff fixtures", () => {
    expect(validateWorkspaceFixtures()).toEqual(["adverse.json", "happy.json"]);
  });
});
