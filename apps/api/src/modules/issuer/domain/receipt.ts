import { canonicalHash } from "../../../reliability/canonical-json.js";
import { IssuerAdapterError } from "./errors.js";
import {
  issuerTransactionHash,
  validateRevisedIssuerTransaction,
  validateIssuerTransaction,
} from "./transaction.js";
import type {
  IssuerApprovalReceipt,
  IssuerApprovalRequest,
} from "./types.js";

export function issuerRequestHash(request: IssuerApprovalRequest): string {
  validateIssuerTransaction(request.transaction);
  if (!Number.isFinite(new Date(request.requestedAt).getTime()) || request.correlationId.length < 8) {
    throw new IssuerAdapterError("REJECTED", "Issuer approval request metadata is invalid.");
  }
  return canonicalHash(request);
}

export function issuerReceiptHash(receipt: Omit<IssuerApprovalReceipt, "receiptHash">): string {
  return canonicalHash(receipt);
}

export function validateIssuerReceipt(
  request: IssuerApprovalRequest,
  receipt: IssuerApprovalReceipt,
): void {
  const requestHash = issuerRequestHash(request);
  if (receipt.adapterMode !== "SANDBOX" || !receipt.sandbox) mismatch("Issuer receipt is not SANDBOX labeled.");
  if (receipt.correlationId !== request.correlationId || receipt.requestHash !== requestHash) {
    mismatch("Issuer receipt correlation or request identity does not match.");
  }
  if (!Number.isFinite(new Date(receipt.decidedAt).getTime()) || receipt.partnerReference.length < 16) {
    mismatch("Issuer receipt metadata is invalid.");
  }

  const expectedReasons: Record<IssuerApprovalReceipt["status"], string[]> = {
    ACTION_REQUIRED: ["SANDBOX_ISSUER_ACTION_REQUIRED"],
    APPROVED: [],
    PENDING: ["SANDBOX_ISSUER_PENDING"],
    REJECTED: ["SANDBOX_ISSUER_REJECTED"],
    REVISED: ["SANDBOX_ISSUER_REVISED"],
  };
  if (!(receipt.status in expectedReasons)) mismatch("Issuer receipt status is unsupported.");
  if (canonicalHash(receipt.reasonCodes) !== canonicalHash(expectedReasons[receipt.status])) {
    mismatch("Issuer receipt reason codes do not match its status.");
  }

  if (receipt.status === "APPROVED") {
    if (!receipt.approved || receipt.approvedPayloadHash !== issuerTransactionHash(request.transaction)) {
      mismatch("Approved issuer receipt does not bind the proposed transaction.");
    }
    if (receipt.revisedTransaction !== undefined || receipt.revisionHash !== undefined) {
      mismatch("Approved issuer receipt unexpectedly contains a revision.");
    }
  } else if (receipt.status === "REVISED") {
    if (!receipt.approved || receipt.revisedTransaction === undefined || receipt.revisionHash === undefined) {
      mismatch("Revised issuer receipt is incomplete.");
    }
    validateRevisedIssuerTransaction(request.transaction, receipt.revisedTransaction);
    const revisedHash = issuerTransactionHash(receipt.revisedTransaction);
    if (receipt.revisionHash !== revisedHash || receipt.approvedPayloadHash !== revisedHash) {
      mismatch("Revised issuer transaction hash does not reconcile.");
    }
  } else {
    if (receipt.approved || receipt.approvedPayloadHash !== undefined || receipt.revisedTransaction !== undefined) {
      mismatch("Non-approved issuer outcome was represented as success.");
    }
    if (receipt.status === "ACTION_REQUIRED") {
      if (receipt.action?.code !== "CONTACT_SANDBOX_ISSUER" || receipt.action.reference.length < 8) {
        mismatch("Issuer action-required receipt is missing its safe action reference.");
      }
    } else if (receipt.action !== undefined) {
      mismatch("Issuer receipt unexpectedly contains an action.");
    }
  }

  const { receiptHash, ...unsigned } = receipt;
  if (receiptHash !== issuerReceiptHash(unsigned)) mismatch("Issuer receipt hash is invalid.");
}

function mismatch(message: string): never {
  throw new IssuerAdapterError("RECONCILIATION_MISMATCH", message);
}
