import assert from "node:assert/strict";
import test from "node:test";
import { addMoney, describeAsset, formatMoney, subtractMoney } from "./money.ts";

test("formats canonical integer strings at scales 0, 2, 6, and 7", () => {
  assert.equal(formatMoney({ amountMinor: "0", currency: "IDR", scale: 0 }), "Rp 0");
  assert.equal(formatMoney({ amountMinor: "12345", currency: "IDR", scale: 2 }), "Rp 123,45");
  assert.equal(formatMoney({ amountMinor: "1234567", currency: "USDC", scale: 6 }), "USDC 1,234567");
  assert.equal(formatMoney({ amountMinor: "640000000", currency: "JUSD", scale: 7 }), "JUSD 64");
});

test("preserves negatives and values beyond Number.MAX_SAFE_INTEGER", () => {
  assert.equal(formatMoney({ amountMinor: "-900719925474099312345", currency: "IDR", scale: 2 }), "−Rp 9.007.199.254.740.993.123,45");
});

test("uses deterministic compact formatting without floating point", () => {
  assert.equal(formatMoney({ amountMinor: "125000000000", currency: "IDR", scale: 2 }, "compact"), "Rp 1.3B");
});

test("adds and subtracts only matching assets", () => {
  const left = { amountMinor: "100", currency: "JUSD", scale: 7, issuer: "GISSUER" };
  assert.equal(addMoney(left, { ...left, amountMinor: "23" }).amountMinor, "123");
  assert.equal(subtractMoney(left, { ...left, amountMinor: "23" }).amountMinor, "77");
  assert.throws(() => addMoney(left, { amountMinor: "1", currency: "IDR", scale: 2 }));
  assert.equal(describeAsset(left), "JUSD · issuer GISSUE…SUER");
});
