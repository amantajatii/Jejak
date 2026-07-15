import { DomainError, validationError } from "../../shared/errors.js";
import { assertSameMoneyUnit, compareMoney, type MoneyValue, zeroMoney } from "../../shared/money.js";
import type { LifecycleClaim } from "./lifecycle.js";

export type LifecycleOffer = {
  id: string;
  claimId: string;
  originatorId: string;
  principal: MoneyValue;
  fee: MoneyValue;
  annualizedRateBps: number;
  advanceRateBps: number;
  expiresAt: string;
  termsHash: string;
  status: "OFFERED" | "ACCEPTED" | "EXPIRED" | "CANCELLED";
  createdAt: string;
  version: number;
};

export function createFinancingOffer(input: {
  id: string;
  originatorId: string;
  claim: LifecycleClaim;
  principal: MoneyValue;
  fee: MoneyValue;
  annualizedRateBps: number;
  advanceRateBps: number;
  expiresAt: string;
  termsHash: string;
  hasActiveOffer: boolean;
  now: string;
}): LifecycleOffer {
  if (input.claim.state !== "ELIGIBLE") {
    throw new DomainError(
      "INVALID_STATE_TRANSITION",
      "Financing offers require an eligible claim.",
    );
  }
  if (input.hasActiveOffer) {
    validationError("Claim already has an active financing offer.");
  }
  assertSameMoneyUnit(input.claim.advanceAmount, input.principal);
  assertSameMoneyUnit(input.principal, input.fee);
  if (
    compareMoney(input.principal, zeroMoney(input.principal)) <= 0 ||
    compareMoney(input.principal, input.claim.advanceAmount) > 0
  ) {
    validationError("Offer principal must be positive and within the verified advance amount.");
  }
  if (compareMoney(input.fee, zeroMoney(input.fee)) < 0) {
    validationError("Offer fee cannot be negative.");
  }
  if (!Number.isInteger(input.annualizedRateBps) || input.annualizedRateBps < 0) {
    validationError("Annualized rate must be a non-negative integer in basis points.");
  }
  if (!Number.isInteger(input.advanceRateBps) || input.advanceRateBps < 0 || input.advanceRateBps > 10000) {
    validationError("Advance rate must be an integer from 0 through 10000 basis points.");
  }
  if (!/^[0-9a-f]{64}$/.test(input.termsHash)) {
    validationError("Offer terms hash must be lowercase SHA-256 hex.");
  }
  const expiresAt = new Date(input.expiresAt);
  const now = new Date(input.now);
  if (Number.isNaN(expiresAt.valueOf()) || Number.isNaN(now.valueOf()) || expiresAt <= now) {
    validationError("Offer expiry must be in the future.");
  }
  return {
    id: input.id,
    claimId: input.claim.id,
    originatorId: input.originatorId,
    principal: input.principal,
    fee: input.fee,
    annualizedRateBps: input.annualizedRateBps,
    advanceRateBps: input.advanceRateBps,
    expiresAt: input.expiresAt,
    termsHash: input.termsHash,
    status: "OFFERED",
    createdAt: input.now,
    version: 1,
  };
}

export function acceptFinancingOffer(
  offer: LifecycleOffer,
  input: {
    expectedVersion: number;
    acceptedTermsHash: string;
    sellerAuthorized: boolean;
    now: string;
  },
): LifecycleOffer {
  if (offer.version !== input.expectedVersion) {
    throw new DomainError("VERSION_CONFLICT", "Offer version does not match If-Match.");
  }
  if (!input.sellerAuthorized) {
    validationError("Seller is not authorized to accept this offer.");
  }
  if (offer.status !== "OFFERED") {
    throw new DomainError("INVALID_STATE_TRANSITION", "Only offered terms can be accepted.");
  }
  if (
    Number.isNaN(new Date(input.now).valueOf()) ||
    new Date(offer.expiresAt) <= new Date(input.now)
  ) {
    throw new DomainError("INVALID_STATE_TRANSITION", "Financing offer has expired.");
  }
  if (offer.termsHash !== input.acceptedTermsHash) {
    validationError("Accepted terms hash does not match the offered terms.");
  }
  return { ...offer, status: "ACCEPTED", version: offer.version + 1 };
}
