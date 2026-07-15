import { canonicalHash } from "../../../reliability/canonical-json.js";
import type { ChainActionReceipt, ChainActionRequest } from "./types.js";
import { FundingSagaError } from "./errors.js";

export function chainActionRequestHash(request: ChainActionRequest): string {
  return canonicalHash(request);
}

export function validateChainActionReceipt(request: ChainActionRequest, receipt: ChainActionReceipt): void {
  const requestHash = chainActionRequestHash(request);
  const { receiptHash, ...unsigned } = receipt;
  if (
    !receipt.sandbox || receipt.status !== "CONFIRMED" || receipt.action !== request.action ||
    receipt.envelopeHash !== request.envelopeHash || receipt.network !== request.network ||
    receipt.requestHash !== requestHash || receiptHash !== canonicalHash(unsigned) ||
    receipt.transactionHash.length !== 64 || !Number.isInteger(receipt.ledgerSequence)
  ) {
    throw new FundingSagaError("PARTNER_REJECTED", "Chain action receipt failed reconciliation.");
  }
}
