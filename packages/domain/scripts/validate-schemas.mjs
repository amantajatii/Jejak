import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import { loadSchemas } from "./schema-registry.mjs";

export function createValidator() {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  ajv.addFormat("uuid-v7", /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  ajv.addFormat("sha256-hex", /^[0-9a-f]{64}$/);
  ajv.addFormat("stellar-address", /^G[A-Z2-7]{55}$/);
  ajv.addFormat(
    "utc-rfc3339",
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/,
  );

  const schemas = loadSchemas();
  for (const { schema } of schemas) {
    ajv.addSchema(schema);
  }
  for (const { schema } of schemas) {
    if (ajv.getSchema(schema.$id) === undefined) {
      throw new Error(`Schema did not compile: ${schema.$id}`);
    }
  }
  return ajv;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const ajv = createValidator();
  process.stdout.write(`Validated ${Object.keys(ajv.schemas).length} schema resources.\n`);
}
