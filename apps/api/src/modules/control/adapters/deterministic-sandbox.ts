import { canonicalHash } from "../../../reliability/canonical-json.js";
import { ControlAdapterError } from "../domain/errors.js";
import {
  controlReceiptHash,
  controlRequestHash,
} from "../domain/receipt.js";
import type {
  ControlDecisionStatus,
  ControlEvidenceRequest,
  ControlReceipt,
  ControlSandboxScenario,
} from "../domain/types.js";
import type { ControlEvidencePort } from "../ports/control-evidence.js";

type StoredDecision = { receipt: ControlReceipt; requestHash: string };

export class DeterministicControlEvidenceSandbox implements ControlEvidencePort {
  readonly mode = "SANDBOX" as const;
  readonly #attempts = new Map<string, number>();
  readonly #clock: () => Date;
  readonly #decisions = new Map<string, StoredDecision>();
  readonly #scenario: ControlSandboxScenario;

  constructor(input: { clock?: () => Date; scenario?: ControlSandboxScenario } = {}) {
    this.#clock = input.clock ?? (() => new Date());
    this.#scenario = input.scenario ?? "VERIFIED";
  }

  async findDecision(partnerIdempotencyKey: string): Promise<ControlReceipt | null> {
    const stored = this.#decisions.get(partnerIdempotencyKey);
    return stored === undefined ? null : structuredClone(stored.receipt);
  }

  async verifyControl(request: ControlEvidenceRequest): Promise<ControlReceipt> {
    const requestHash = controlRequestHash(request);
    const existing = this.#decisions.get(request.partnerIdempotencyKey);
    if (existing !== undefined) {
      if (existing.requestHash !== requestHash) {
        throw new ControlAdapterError(
          "PROTOCOL_MISMATCH",
          "Control partner idempotency key was reused with a different request.",
        );
      }
      return structuredClone(existing.receipt);
    }

    const attempt = (this.#attempts.get(request.partnerIdempotencyKey) ?? 0) + 1;
    this.#attempts.set(request.partnerIdempotencyKey, attempt);
    if (this.#scenario === "TIMEOUT") {
      throw new ControlAdapterError("TIMEOUT", "Control-evidence sandbox timed out.");
    }
    if (this.#scenario === "TIMEOUT_THEN_VERIFIED" && attempt === 1) {
      throw new ControlAdapterError("TIMEOUT", "Control-evidence sandbox timed out before deciding.");
    }

    const status = statusForScenario(this.#scenario);
    const unsigned = {
      adapterMode: "SANDBOX" as const,
      decidedAt: this.#clock().toISOString(),
      partnerReference: `sandbox-control-${canonicalHash({ requestHash }).slice(0, 24)}`,
      reasonCodes: reasonsForStatus(status),
      requestHash,
      sandbox: true,
      status,
    };
    let receipt: ControlReceipt = { ...unsigned, receiptHash: controlReceiptHash(unsigned) };
    if (this.#scenario === "PROTOCOL_MISMATCH") {
      const mismatched = { ...receipt, requestHash: "0".repeat(64) };
      const { receiptHash: _receiptHash, ...mismatchedUnsigned } = mismatched;
      receipt = { ...mismatchedUnsigned, receiptHash: controlReceiptHash(mismatchedUnsigned) };
    }
    this.#decisions.set(request.partnerIdempotencyKey, { receipt, requestHash });
    if (this.#scenario === "LOST_RESPONSE_THEN_VERIFIED" && attempt === 1) {
      throw new ControlAdapterError("TRANSPORT", "Control-evidence sandbox response was lost after deciding.");
    }
    return structuredClone(receipt);
  }
}

function statusForScenario(scenario: ControlSandboxScenario): ControlDecisionStatus {
  if (scenario === "REJECTED" || scenario === "PENDING" || scenario === "EXPIRED") return scenario;
  return "VERIFIED";
}

function reasonsForStatus(status: ControlDecisionStatus): string[] {
  switch (status) {
    case "EXPIRED": return ["SANDBOX_CONTROL_EXPIRED"];
    case "PENDING": return ["SANDBOX_CONTROL_PENDING"];
    case "REJECTED": return ["SANDBOX_CONTROL_REJECTED"];
    case "VERIFIED": return [];
  }
}
