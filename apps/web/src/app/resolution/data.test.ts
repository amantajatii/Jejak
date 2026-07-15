import test from "node:test";
import assert from "node:assert/strict";
import { cases, finalLoss } from "./data.ts";

test("resolution fixtures stay assigned-only and calculate final loss", () => {
  assert.equal(cases.every((item) => item.assignedTo === "Resolver Sandbox"), true);
  assert.equal(finalLoss(cases[0]), cases[0].shortfall - cases[0].recovered);
  assert.equal(finalLoss(cases[2]), 0);
});
