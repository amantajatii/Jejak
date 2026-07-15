import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("hero scroll inset uses scrubbed ScrollTrigger and Stellar is an inset card", () => {
  const hero = readFileSync(new URL("./LandingHero.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../../app/landing.css", import.meta.url), "utf8");

  assert.match(hero, /ScrollTrigger/);
  assert.match(hero, /scrub:\s*true/);
  assert.match(hero, /end:\s*"\+=240"/);
  assert.doesNotMatch(hero, /"--hero-inset":\s*"clamp\(/);
  assert.match(styles, /--hero-inset/);
  assert.match(styles, /clip-path:\s*inset\(/);
  assert.match(styles, /\.landing-stellar\s*{[^}]*margin-inline:/s);
});
