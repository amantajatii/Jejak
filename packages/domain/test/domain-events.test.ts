import { describe, expect, it } from "vitest";
import type { ErrorObject } from "ajv";

import { createValidator } from "../scripts/validate-schemas.mjs";

describe("DomainEvent", () => {
  it("requires audit correlation, actor, version, and idempotency fields", () => {
    const validate = createValidator().getSchema(
      "https://jejak.finance/schemas/events/domain-event.schema.json",
    );

    expect(validate?.({ eventId: "0198a5ea-7c9c-7000-8000-000000000001" })).toBe(false);
    expect(validate?.errors?.map((error: ErrorObject) => error.params)).toBeDefined();
  });
});
