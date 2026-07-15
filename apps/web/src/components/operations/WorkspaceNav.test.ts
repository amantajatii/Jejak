import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("primary navigation moves one highlight to the active link", () => {
  const component = readFileSync(new URL("./WorkspaceNav.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../../app/operations.css", import.meta.url), "utf8");

  assert.match(component, /"--active-nav-offset": `\$\{activeIndex \* 44\}px`/);
  assert.match(styles, /workspace-primary-nav::before/);
  assert.match(styles, /translateY\(var\(--active-nav-offset\)\)/);
  assert.match(styles, /transition:\s*transform/);
});
