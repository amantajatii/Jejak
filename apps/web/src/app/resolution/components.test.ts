import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("resolution detail matching does not activate the root item on section routes", () => {
  const components = readFileSync(new URL("./components.tsx", import.meta.url), "utf8");

  assert.match(components, /const hasSectionMatch = nav\.slice\(1\)\.some/);
  assert.match(components, /!hasSectionMatch && \/\^\\\/resolution/);
});
