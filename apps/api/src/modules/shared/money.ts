import { validationError } from "./errors.js";

export type MoneyValue = {
  amountMinor: string;
  currency: string;
  scale: number;
  issuer?: string;
};

const integerPattern = /^-?(0|[1-9][0-9]*)$/;

export function assertMoney(value: MoneyValue): void {
  if (!integerPattern.test(value.amountMinor)) {
    validationError("Money amountMinor must be a canonical integer string.");
  }
  if (!/^[A-Z0-9]{3,12}$/.test(value.currency)) {
    validationError("Money currency must be canonical uppercase currency or asset code.");
  }
  if (!Number.isInteger(value.scale) || value.scale < 0 || value.scale > 18) {
    validationError("Money scale must be an integer from 0 through 18.");
  }
}

export function sameMoneyUnit(left: MoneyValue, right: MoneyValue): boolean {
  return (
    left.currency === right.currency &&
    left.scale === right.scale &&
    (left.issuer ?? null) === (right.issuer ?? null)
  );
}

export function assertSameMoneyUnit(left: MoneyValue, right: MoneyValue): void {
  assertMoney(left);
  assertMoney(right);
  if (!sameMoneyUnit(left, right)) {
    validationError("Money values use incompatible currency, scale, or issuer units.");
  }
}

export function moneyAmount(value: MoneyValue): bigint {
  assertMoney(value);
  return BigInt(value.amountMinor);
}

export function withMoneyAmount(template: MoneyValue, amount: bigint): MoneyValue {
  return {
    amountMinor: amount.toString(),
    currency: template.currency,
    scale: template.scale,
    ...(template.issuer === undefined ? {} : { issuer: template.issuer }),
  };
}

export function addMoney(left: MoneyValue, right: MoneyValue): MoneyValue {
  assertSameMoneyUnit(left, right);
  return withMoneyAmount(left, moneyAmount(left) + moneyAmount(right));
}

export function compareMoney(left: MoneyValue, right: MoneyValue): -1 | 0 | 1 {
  assertSameMoneyUnit(left, right);
  const difference = moneyAmount(left) - moneyAmount(right);
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}

export function zeroMoney(template: MoneyValue): MoneyValue {
  assertMoney(template);
  return withMoneyAmount(template, 0n);
}
