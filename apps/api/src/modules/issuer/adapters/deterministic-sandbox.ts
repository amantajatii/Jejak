import { canonicalHash } from "../../../reliability/canonical-json.js";
import { IssuerAdapterError } from "../domain/errors.js";
import {
  issuerReceiptHash,
  issuerRequestHash,
} from "../domain/receipt.js";
import { issuerTransactionHash } from "../domain/transaction.js";
import type {
  IssuerApprovalReceipt,
  IssuerApprovalRequest,
  IssuerApprovalStatus,
  IssuerSandboxScenario,
  IssuerTransactionPayload,
} from "../domain/types.js";
import type { IssuerApprovalPort } from "../ports/issuer-approval.js";

type StoredApproval = { receipt: IssuerApprovalReceipt; requestHash: string };

export class DeterministicIssuerSandbox implements IssuerApprovalPort {
  readonly mode = "SANDBOX" as const;
  readonly #approvals = new Map<string, StoredApproval>();
  readonly #attempts = new Map<string, number>();
  readonly #clock: () => Date;
  readonly #scenario: IssuerSandboxScenario;

  constructor(input: { clock?: () => Date; scenario?: IssuerSandboxScenario } = {}) {
    this.#clock = input.clock ?? (() => new Date());
    this.#scenario = input.scenario ?? "APPROVED";
  }

  async findApproval(partnerIdempotencyKey: string): Promise<IssuerApprovalReceipt | null> {
    const stored = this.#approvals.get(partnerIdempotencyKey);
    return stored === undefined ? null : structuredClone(stored.receipt);
  }

  async requestApproval(request: IssuerApprovalRequest): Promise<IssuerApprovalReceipt> {
    const requestHash = issuerRequestHash(request);
    const existing = this.#approvals.get(request.partnerIdempotencyKey);
    if (existing !== undefined) {
      if (existing.requestHash !== requestHash) {
        throw new IssuerAdapterError(
          "PROTOCOL_MISMATCH",
          "Issuer idempotency key was reused with a different approval request.",
        );
      }
      return structuredClone(existing.receipt);
    }

    const attempt = (this.#attempts.get(request.partnerIdempotencyKey) ?? 0) + 1;
    this.#attempts.set(request.partnerIdempotencyKey, attempt);
    if (this.#scenario === "TIMEOUT") {
      throw new IssuerAdapterError("TIMEOUT", "Issuer sandbox timed out.");
    }
    if (this.#scenario === "TIMEOUT_THEN_APPROVED" && attempt === 1) {
      throw new IssuerAdapterError("TIMEOUT", "Issuer sandbox timed out before deciding.");
    }

    const status = statusForScenario(this.#scenario);
    const partnerReference = `sandbox-issuer-${canonicalHash({ requestHash }).slice(0, 24)}`;
    const optional = optionalReceiptFields(status, request, partnerReference, this.#scenario);
    const unsigned = {
      adapterMode: "SANDBOX" as const,
      approved: status === "APPROVED" || status === "REVISED",
      correlationId: request.correlationId,
      decidedAt: this.#clock().toISOString(),
      partnerReference,
      reasonCodes: reasonsForStatus(status),
      requestHash,
      sandbox: true,
      status,
      ...optional,
    };
    let receipt: IssuerApprovalReceipt = { ...unsigned, receiptHash: issuerReceiptHash(unsigned) };
    if (this.#scenario === "PROTOCOL_MISMATCH") {
      const mismatched = { ...receipt, correlationId: "mismatched-correlation" };
      const { receiptHash: _receiptHash, ...mismatchedUnsigned } = mismatched;
      receipt = { ...mismatchedUnsigned, receiptHash: issuerReceiptHash(mismatchedUnsigned) };
    }
    this.#approvals.set(request.partnerIdempotencyKey, { receipt, requestHash });
    if (this.#scenario === "LOST_RESPONSE_THEN_APPROVED" && attempt === 1) {
      throw new IssuerAdapterError("TRANSPORT", "Issuer sandbox response was lost after approval.");
    }
    return structuredClone(receipt);
  }
}

function statusForScenario(scenario: IssuerSandboxScenario): IssuerApprovalStatus {
  if (
    scenario === "REVISED" ||
    scenario === "INVALID_REVISED" ||
    scenario === "PENDING" ||
    scenario === "ACTION_REQUIRED" ||
    scenario === "REJECTED"
  ) return scenario === "INVALID_REVISED" ? "REVISED" : scenario;
  return "APPROVED";
}

function optionalReceiptFields(
  status: IssuerApprovalStatus,
  request: IssuerApprovalRequest,
  partnerReference: string,
  scenario: IssuerSandboxScenario,
): Pick<IssuerApprovalReceipt, "action"> |
  Pick<IssuerApprovalReceipt, "approvedPayloadHash"> |
  Pick<IssuerApprovalReceipt, "approvedPayloadHash" | "revisedTransaction" | "revisionHash"> |
  Record<string, never> {
  if (status === "APPROVED") {
    return { approvedPayloadHash: issuerTransactionHash(request.transaction) };
  }
  if (status === "REVISED") {
    const revisedTransaction = reviseTransaction(request.transaction, scenario === "INVALID_REVISED");
    const revisionHash = issuerTransactionHash(revisedTransaction);
    return { approvedPayloadHash: revisionHash, revisedTransaction, revisionHash };
  }
  if (status === "ACTION_REQUIRED") {
    return {
      action: {
        code: "CONTACT_SANDBOX_ISSUER",
        reference: `${partnerReference}-action`,
      },
    };
  }
  return {};
}

function reviseTransaction(
  transaction: IssuerTransactionPayload,
  invalid: boolean,
): IssuerTransactionPayload {
  return {
    ...transaction,
    amountMinor: invalid ? (BigInt(transaction.amountMinor) + 1n).toString() : transaction.amountMinor,
    envelopeHash: canonicalHash({
      originalEnvelopeHash: transaction.envelopeHash,
      revision: "SANDBOX_ISSUER_REVISION_V1",
    }),
    sequence: (BigInt(transaction.sequence) + 1n).toString(),
  };
}

function reasonsForStatus(status: IssuerApprovalStatus): string[] {
  switch (status) {
    case "ACTION_REQUIRED": return ["SANDBOX_ISSUER_ACTION_REQUIRED"];
    case "APPROVED": return [];
    case "PENDING": return ["SANDBOX_ISSUER_PENDING"];
    case "REJECTED": return ["SANDBOX_ISSUER_REJECTED"];
    case "REVISED": return ["SANDBOX_ISSUER_REVISED"];
  }
}
