import { describe, expect, it } from "vitest";

import { loadSchemas } from "../scripts/schema-registry.mjs";
import { createValidator } from "../scripts/validate-schemas.mjs";

describe("schema registry", () => {
  it("loads unique schema IDs and resolves every reference", () => {
    const schemas = loadSchemas();
    const ids = schemas.map(({ schema }) => schema.$id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(() => createValidator()).not.toThrow();
  });
});
