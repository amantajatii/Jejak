import { canonicalHash } from "../../../reliability/canonical-json.js";
import {
  assertMoney,
  assertSameMoneyUnit,
  moneyAmount,
  sameMoneyUnit,
  type MoneyValue,
} from "../../shared/money.js";
import { AnchorError } from "./errors.js";
import { convertSandboxPayout } from "./conversion.js";
import type {
  AnchorPayoutReceipt,
  AnchorPayoutRequest,
  AnchorSandboxConfig,
} from "./types.js";

export function anchorRequestHash(request: AnchorPayoutRequest): string {
  assertMoney(request.source);
  return canonicalHash(request);
}

export function anchorReceiptHash(receipt: Omit<AnchorPayoutReceipt, "receiptHash">): string {
  return canonicalHash(receipt);
}

export function validateAnchorReceipt(
  request: AnchorPayoutRequest,
  receipt: AnchorPayoutReceipt,
  config: AnchorSandboxConfig,
): void {
  const expectedRequestHash = anchorRequestHash(request);
  if (
    receipt.adapterMode !== "SANDBOX" ||
    !receipt.sandbox ||
    receipt.status !== "PAID" ||
    receipt.roundingMode !== "DOWN"
  ) {
    mismatch("Anchor receipt is not a supported sandbox payout receipt.");
  }
  if (receipt.requestHash !== expectedRequestHash) {
    mismatch("Anchor receipt request identity does not match.");
  }
  if (!sameMoney(request.source, receipt.source)) {
    mismatch("Anchor receipt source Money does not match.");
  }
  const expected = convertSandboxPayout(request.source, config);
  if (
    receipt.feeBps !== expected.feeBps ||
    canonicalHash(receipt.rate) !== canonicalHash(expected.rate) ||
    !sameMoney(receipt.targetGross, expected.targetGross) ||
    !sameMoney(receipt.fee, expected.fee) ||
    !sameMoney(receipt.targetNet, expected.targetNet)
  ) {
    mismatch("Anchor receipt conversion does not reconcile.");
  }
  assertSameMoneyUnit(receipt.targetGross, receipt.fee);
  assertSameMoneyUnit(receipt.targetGross, receipt.targetNet);
  if (moneyAmount(receipt.targetGross) !== moneyAmount(receipt.fee) + moneyAmount(receipt.targetNet)) {
    mismatch("Anchor receipt target Money does not balance.");
  }
  if (receipt.partnerReference.length < 16 || !Number.isFinite(new Date(receipt.completedAt).getTime())) {
    mismatch("Anchor receipt metadata is invalid.");
  }
  const { receiptHash, ...unsigned } = receipt;
  if (receiptHash !== anchorReceiptHash(unsigned)) {
    mismatch("Anchor receipt hash does not match its canonical content.");
  }
}

function sameMoney(left: MoneyValue, right: MoneyValue): boolean {
  return sameMoneyUnit(left, right) && left.amountMinor === right.amountMinor;
}

function mismatch(message: string): never {
  throw new AnchorError("RECONCILIATION_MISMATCH", message);
}

