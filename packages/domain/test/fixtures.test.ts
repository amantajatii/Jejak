import { describe, expect, it } from "vitest";

import { validateFixtures } from "../scripts/validate-fixtures.mjs";

describe("shared scenario fixtures", () => {
  it("validates all eight deterministic sandbox scenarios", () => {
    expect(validateFixtures()).toHaveLength(8);
  });
});
