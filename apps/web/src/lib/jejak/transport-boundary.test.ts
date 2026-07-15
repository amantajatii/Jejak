import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("API gateway never imports mock data or mock transport", async () => {
  const source = await readFile(new URL("./api-gateway.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /mock-gateway|fixtures\/workspaces/);
});
