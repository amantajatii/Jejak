import type { Money } from "./gateway";

export type MoneyDisplay = "full" | "compact";

function splitAmount(value: Money) {
  if (!/^-?\d+$/.test(value.amountMinor) || !Number.isInteger(value.scale) || value.scale < 0) throw new Error("Invalid canonical Money value");
  const negative = value.amountMinor.startsWith("-");
  const digits = negative ? value.amountMinor.slice(1) : value.amountMinor;
  const padded = digits.padStart(value.scale + 1, "0");
  const whole = value.scale === 0 ? padded : padded.slice(0, -value.scale);
  const fraction = value.scale === 0 ? "" : padded.slice(-value.scale);
  return { negative, whole, fraction };
}

function group(value: string) { return value.replace(/\B(?=(\d{3})+(?!\d))/g, "."); }
function assetLabel(money: Money) { return money.currency === "IDR" ? "Rp" : money.currency; }

export function formatMoney(money: Money, display: MoneyDisplay = "full") {
  const { negative, whole, fraction } = splitAmount(money);
  const prefix = `${negative ? "−" : ""}${assetLabel(money)} `;
  if (display === "compact") {
    const amount = BigInt(whole);
    const units = [{ value: 1_000_000_000_000n, suffix: "T" }, { value: 1_000_000_000n, suffix: "B" }, { value: 1_000_000n, suffix: "M" }, { value: 1_000n, suffix: "K" }];
    const unit = units.find((candidate) => amount >= candidate.value);
    if (unit) {
      const tenths = (amount * 10n + unit.value / 2n) / unit.value;
      const decimal = tenths % 10n;
      return `${prefix}${tenths / 10n}${decimal === 0n ? "" : `.${decimal}`}${unit.suffix}`;
    }
  }
  const trimmedFraction = fraction.replace(/0+$/, "");
  return `${prefix}${group(whole)}${trimmedFraction ? `,${trimmedFraction}` : ""}`;
}

export function addMoney(left: Money, right: Money): Money {
  if (left.currency !== right.currency || left.scale !== right.scale || left.issuer !== right.issuer) throw new Error("Money assets do not match");
  return { ...left, amountMinor: (BigInt(left.amountMinor) + BigInt(right.amountMinor)).toString() };
}

export function subtractMoney(left: Money, right: Money): Money { return addMoney(left, { ...right, amountMinor: (-BigInt(right.amountMinor)).toString() }); }
export function moneyPercent(value: Money, total: Money): string { return BigInt(total.amountMinor) === 0n ? "0%" : `${(BigInt(value.amountMinor) * 100n) / BigInt(total.amountMinor)}%`; }
export function describeAsset(money: Money) { return money.issuer ? `${money.currency} · issuer ${money.issuer.slice(0, 6)}…${money.issuer.slice(-4)}` : money.currency; }
