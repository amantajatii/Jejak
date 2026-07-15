import { globSync, readFileSync } from "node:fs";
import path from "node:path";

import { packageRoot } from "./schema-registry.mjs";
import { createValidator } from "./validate-schemas.mjs";

const scenarioSchemaId = "https://jejak.finance/schemas/fixtures/scenario.schema.json";

export function validateFixtures() {
  const fixturesRoot = path.join(packageRoot, "fixtures");
  const files = globSync("*.json", { cwd: fixturesRoot }).sort();
  const validate = createValidator().getSchema(scenarioSchemaId);
  if (validate === undefined) {
    throw new Error(`Missing compiled fixture schema: ${scenarioSchemaId}`);
  }

  const names = new Set();
  for (const relativePath of files) {
    const raw = readFileSync(path.join(fixturesRoot, relativePath), "utf8");
    const fixture = JSON.parse(raw);
    if (!validate(fixture)) {
      throw new Error(`${relativePath} failed validation: ${JSON.stringify(validate.errors)}`);
    }
    if (names.has(fixture.scenario)) {
      throw new Error(`Duplicate fixture scenario: ${fixture.scenario}`);
    }
    names.add(fixture.scenario);
    const serialized = JSON.stringify(fixture);
    if (serialized !== JSON.stringify(JSON.parse(serialized))) {
      throw new Error(`${relativePath} does not serialize deterministically.`);
    }
  }

  if (files.length !== 8) {
    throw new Error(`Expected 8 scenario fixtures, found ${files.length}.`);
  }
  return files;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const files = validateFixtures();
  process.stdout.write(`Validated ${files.length} deterministic scenario fixtures.\n`);
}
