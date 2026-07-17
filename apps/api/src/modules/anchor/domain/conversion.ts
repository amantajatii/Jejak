import {
  assertMoney,
  moneyAmount,
  type MoneyValue,
  withMoneyAmount,
} from "../../shared/money.js";
import { validationError } from "../../shared/errors.js";
import type { AnchorRate, AnchorSandboxConfig } from "./types.js";

const positiveIntegerPattern = /^[1-9][0-9]*$/;

function powerOfTen(scale: number): bigint {
  return 10n ** BigInt(scale);
}

export type AnchorConversion = {
  fee: MoneyValue;
  feeBps: number;
  rate: AnchorRate;
  remainderNumerator: string;
  targetGross: MoneyValue;
  targetNet: MoneyValue;
};

export function convertSandboxPayout(
  source: MoneyValue,
  rawConfig: AnchorSandboxConfig,
): AnchorConversion {
  assertMoney(source);
  const config = normalizeSandboxConfig(rawConfig);
  if (source.currency !== config.sourceCurrency || source.scale !== config.sourceScale) {
    validationError(`Anchor sandbox accepts only ${config.sourceCurrency} Money at scale ${config.sourceScale}.`);
  }
  const sourceAmount = moneyAmount(source);
  if (sourceAmount <= 0n) validationError("Anchor payout amount must be positive.");

  const numerator = BigInt(config.rateNumerator);
  const denominator = BigInt(config.rateDenominator);
  const scaledNumerator = sourceAmount * numerator * powerOfTen(config.targetScale);
  const scaledDenominator = denominator * powerOfTen(source.scale);
  const grossAmount = scaledNumerator / scaledDenominator;
  const remainder = scaledNumerator % scaledDenominator;
  const feeAmount = (grossAmount * BigInt(config.feeBps)) / 10_000n;
  const netAmount = grossAmount - feeAmount;
  if (grossAmount <= 0n || netAmount <= 0n) {
    validationError("Anchor conversion must produce a positive target payout.");
  }

  const targetTemplate: MoneyValue = {
    amountMinor: "0",
    currency: config.targetCurrency,
    issuer: config.targetIssuer,
    scale: config.targetScale,
  };
  return {
    fee: withMoneyAmount(targetTemplate, feeAmount),
    feeBps: config.feeBps,
    rate: {
      denominator: config.rateDenominator,
      numerator: config.rateNumerator,
      sourceCurrency: config.sourceCurrency,
      targetCurrency: config.targetCurrency,
    },
    remainderNumerator: remainder.toString(),
    targetGross: withMoneyAmount(targetTemplate, grossAmount),
    targetNet: withMoneyAmount(targetTemplate, netAmount),
  };
}

export function normalizeSandboxConfig(config: AnchorSandboxConfig): Required<AnchorSandboxConfig> {
  if (!positiveIntegerPattern.test(config.rateNumerator)) {
    validationError("Anchor rate numerator must be a positive canonical integer.");
  }
  if (!positiveIntegerPattern.test(config.rateDenominator)) {
    validationError("Anchor rate denominator must be a positive canonical integer.");
  }
  if (!Number.isInteger(config.feeBps) || config.feeBps < 0 || config.feeBps > 10_000) {
    validationError("Anchor fee basis points must be an integer from 0 through 10000.");
  }
  if (config.sourceCurrency !== undefined && !/^[A-Z0-9]{3,12}$/.test(config.sourceCurrency)) {
    validationError("Anchor source currency is invalid.");
  }
  if (config.sourceScale !== undefined && (!Number.isInteger(config.sourceScale) || config.sourceScale < 0 || config.sourceScale > 18)) {
    validationError("Anchor source scale must be an integer from 0 through 18.");
  }
  if (config.targetCurrency !== undefined && !/^[A-Z0-9]{3,12}$/.test(config.targetCurrency)) {
    validationError("Anchor target currency is invalid.");
  }
  if (config.targetScale !== undefined && (!Number.isInteger(config.targetScale) || config.targetScale < 0 || config.targetScale > 18)) {
    validationError("Anchor target scale must be an integer from 0 through 18.");
  }
  return {
    feeBps: config.feeBps,
    rateDenominator: config.rateDenominator,
    rateNumerator: config.rateNumerator,
    sourceCurrency: config.sourceCurrency ?? "USDC",
    sourceScale: config.sourceScale ?? 6,
    targetCurrency: config.targetCurrency ?? "TIDR",
    targetIssuer: config.targetIssuer ?? "SANDBOX",
    targetScale: config.targetScale ?? 2,
  };
}
