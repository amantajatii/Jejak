import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { test } from "node:test";

const generatedFile = "packages/api-client/src/generated/schema.ts";

test("contract check rejects and repairs a modified generated artifact", () => {
  const original = readFileSync(generatedFile, "utf8");
  appendFileSync(generatedFile, "\n// intentional drift probe\n", "utf8");

  const result = spawnSync(process.execPath, ["scripts/check-generated.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Generated artifacts are out of date/);
  assert.equal(readFileSync(generatedFile, "utf8"), original);
});
