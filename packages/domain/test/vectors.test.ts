import { describe, expect, it } from "vitest";

import { verifyVectors } from "../scripts/verify-vectors.mjs";

describe("cross-language vectors", () => {
  it("verifies all key, hash, Money, and JCC vectors", () => {
    expect(verifyVectors()).toBe(6);
  });
});
