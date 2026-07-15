import { canonicalHash } from "../../../reliability/canonical-json.js";
import { AnchorError } from "../domain/errors.js";
import { convertSandboxPayout } from "../domain/conversion.js";
import {
  anchorReceiptHash,
  anchorRequestHash,
} from "../domain/receipt.js";
import type {
  AnchorPayoutReceipt,
  AnchorPayoutRequest,
  AnchorSandboxConfig,
  AnchorSandboxFailureMode,
} from "../domain/types.js";
import type { AnchorPayoutPort } from "../ports/anchor-payout.js";

type StoredPayout = { receipt: AnchorPayoutReceipt; requestHash: string };

export class DeterministicAnchorSandbox implements AnchorPayoutPort {
  readonly mode = "SANDBOX" as const;
  readonly #attempts = new Map<string, number>();
  readonly #clock: () => Date;
  readonly #config: AnchorSandboxConfig;
  readonly #failureMode: AnchorSandboxFailureMode;
  readonly #payouts = new Map<string, StoredPayout>();

  constructor(input: {
    config: AnchorSandboxConfig;
    clock?: () => Date;
    failureMode?: AnchorSandboxFailureMode;
  }) {
    this.#config = input.config;
    this.#clock = input.clock ?? (() => new Date());
    this.#failureMode = input.failureMode ?? "SUCCESS";
  }

  async findPayout(partnerIdempotencyKey: string): Promise<AnchorPayoutReceipt | null> {
    const stored = this.#payouts.get(partnerIdempotencyKey);
    return stored === undefined ? null : structuredClone(stored.receipt);
  }

  async requestPayout(request: AnchorPayoutRequest): Promise<AnchorPayoutReceipt> {
    const requestHash = anchorRequestHash(request);
    const existing = this.#payouts.get(request.partnerIdempotencyKey);
    if (existing !== undefined) {
      if (existing.requestHash !== requestHash) {
        throw new AnchorError("PROTOCOL_MISMATCH", "Anchor idempotency key was reused with a different request.");
      }
      return structuredClone(existing.receipt);
    }

    const attempt = (this.#attempts.get(request.partnerIdempotencyKey) ?? 0) + 1;
    this.#attempts.set(request.partnerIdempotencyKey, attempt);
    if (this.#failureMode === "REJECTED") {
      throw new AnchorError("REJECTED", "Anchor sandbox rejected the payout.");
    }
    if (this.#failureMode === "TIMEOUT_THEN_SUCCESS" && attempt === 1) {
      throw new AnchorError("TIMEOUT", "Anchor sandbox timed out before creating a payout.");
    }

    const conversion = convertSandboxPayout(request.source, this.#config);
    const unsigned = {
      adapterMode: "SANDBOX" as const,
      completedAt: this.#clock().toISOString(),
      fee: conversion.fee,
      feeBps: conversion.feeBps,
      partnerReference: `sandbox-anchor-${canonicalHash({ requestHash }).slice(0, 24)}`,
      rate: conversion.rate,
      requestHash,
      roundingMode: "DOWN" as const,
      sandbox: true,
      source: structuredClone(request.source),
      status: "PAID" as const,
      targetGross: conversion.targetGross,
      targetNet: conversion.targetNet,
    };
    let receipt: AnchorPayoutReceipt = { ...unsigned, receiptHash: anchorReceiptHash(unsigned) };
    if (this.#failureMode === "PROTOCOL_MISMATCH") {
      const mismatched = { ...receipt, requestHash: "0".repeat(64) };
      const { receiptHash: _receiptHash, ...mismatchedUnsigned } = mismatched;
      receipt = { ...mismatchedUnsigned, receiptHash: anchorReceiptHash(mismatchedUnsigned) };
    }
    this.#payouts.set(request.partnerIdempotencyKey, { receipt, requestHash });
    if (this.#failureMode === "LOST_RESPONSE_THEN_SUCCESS" && attempt === 1) {
      throw new AnchorError("TRANSPORT", "Anchor sandbox response was lost after payout creation.");
    }
    return structuredClone(receipt);
  }
}

