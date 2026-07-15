import { describe, expect, it } from "vitest";

import { createValidator } from "../scripts/validate-schemas.mjs";

describe("Money", () => {
  const validate = createValidator().getSchema(
    "https://jejak.finance/schemas/common/money.schema.json",
  );

  it("accepts integer-string base units", () => {
    expect(validate?.({ amountMinor: "6400000", currency: "IDR", scale: 2 })).toBe(true);
    expect(validate?.({ amountMinor: "-10", currency: "USD", scale: 2 })).toBe(true);
  });

  it.each([6400000, "64.00", "1e6", "01", "+1"])(
    "rejects noncanonical amountMinor %j",
    (amountMinor) => {
      expect(validate?.({ amountMinor, currency: "IDR", scale: 2 })).toBe(false);
    },
  );
});
