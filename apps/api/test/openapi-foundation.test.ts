import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const document = JSON.parse(
  readFileSync(path.join(apiRoot, "openapi", "openapi.json"), "utf8"),
) as {
  openapi: string;
  jsonSchemaDialect: string;
  paths: Record<string, Record<string, unknown>>;
  components: { schemas: Record<string, Record<string, unknown>> };
};

describe("OpenAPI foundation", () => {
  it("uses OpenAPI 3.1 and JSON Schema 2020-12", () => {
    expect(document.openapi).toBe("3.1.0");
    expect(document.jsonSchemaDialect).toBe("https://json-schema.org/draft/2020-12/schema");
  });

  it("publishes health and readiness operations that match the runtime shell", () => {
    expect(document.paths["/health"]?.get).toBeDefined();
    expect(document.paths["/ready"]?.get).toBeDefined();
  });

  it("keeps Money in integer base units", () => {
    const money = Object.values(document.components.schemas).find(
      (schema) => schema.title === "Money",
    ) as { properties?: { amountMinor?: { $ref?: string } } } | undefined;
    expect(money?.properties?.amountMinor?.$ref).toMatch(/integerString$/);
    const integerString = document.components.schemas.integerString as { pattern?: string };
    expect(integerString.pattern).toBe("^-?(0|[1-9][0-9]*)$");
  });
});
