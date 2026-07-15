import { canonicalHash } from "../../../reliability/canonical-json.js";
import { IssuerAdapterError } from "./errors.js";
import type { IssuerTransactionPayload } from "./types.js";

const SHA_256 = /^[a-f0-9]{64}$/u;
const POSITIVE_INTEGER = /^[1-9][0-9]*$/u;
const NON_NEGATIVE_INTEGER = /^(0|[1-9][0-9]*)$/u;

export function validateIssuerTransaction(transaction: IssuerTransactionPayload): void {
  if (!POSITIVE_INTEGER.test(transaction.amountMinor)) reject("Issuer amount must be a positive integer.");
  if (!NON_NEGATIVE_INTEGER.test(transaction.sequence)) reject("Issuer sequence must be a non-negative integer.");
  if (!SHA_256.test(transaction.envelopeHash)) reject("Issuer transaction envelope hash is invalid.");
  for (const [name, value] of Object.entries({
    assetCode: transaction.assetCode,
    claimId: transaction.claimId,
    destination: transaction.destination,
    networkPassphrase: transaction.networkPassphrase,
    source: transaction.source,
  })) {
    if (typeof value !== "string" || value.length < 1 || value.length > 256) {
      reject(`Issuer transaction ${name} is invalid.`);
    }
  }
}

export function issuerTransactionHash(transaction: IssuerTransactionPayload): string {
  validateIssuerTransaction(transaction);
  return canonicalHash(transaction);
}

export function validateRevisedIssuerTransaction(
  proposed: IssuerTransactionPayload,
  revised: IssuerTransactionPayload,
): void {
  validateIssuerTransaction(proposed);
  validateIssuerTransaction(revised);
  const immutableFields: (keyof IssuerTransactionPayload)[] = [
    "amountMinor",
    "assetCode",
    "claimId",
    "destination",
    "networkPassphrase",
    "operation",
    "source",
  ];
  for (const field of immutableFields) {
    if (proposed[field] !== revised[field]) {
      reject(`Issuer revision changed immutable business intent field ${field}.`);
    }
  }
  if (proposed.envelopeHash === revised.envelopeHash) {
    reject("Issuer revision did not provide a distinct transaction envelope.");
  }
}

function reject(message: string): never {
  throw new IssuerAdapterError("RECONCILIATION_MISMATCH", message);
}
