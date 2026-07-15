import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("landing uses a full-width Stellar band and grouped editorial footer", () => {
  const sections = readFileSync(new URL("./LandingSections.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../../app/landing.css", import.meta.url), "utf8");

  assert.match(sections, /className="landing-stellar-inner"/);
  assert.match(sections, /className="landing-footer-main"/);
  assert.match(sections, /aria-label="Footer navigation"/);
  assert.match(sections, />Product</);
  assert.match(sections, />Demos</);
  assert.match(sections, />Network</);
  assert.match(styles, /\.landing-stellar\s*{[^}]*max-width:\s*none/s);
  assert.match(styles, /\.landing-footer-nav\s*{[^}]*grid-template-columns:/s);
});
