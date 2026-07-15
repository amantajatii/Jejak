import { canonicalHash } from "../../../reliability/canonical-json.js";
import { FundingSagaError } from "../domain/errors.js";
import { chainActionRequestHash } from "../domain/chain-receipt.js";
import type { ChainActionReceipt, ChainActionRequest } from "../domain/types.js";
import type { FundingChainPort } from "../ports/funding-chain.js";

export class DeterministicFundingChainSandbox implements FundingChainPort {
  readonly mode = "SANDBOX" as const;
  readonly #actions = new Map<string, ChainActionReceipt>();
  readonly #attempts = new Map<string, number>();

  constructor(private readonly scenario: "SUCCESS" | "TIMEOUT_THEN_SUCCESS" | "LOST_RESPONSE" | "FUND_REJECTED" | "PROTOCOL_MISMATCH" = "SUCCESS") {}

  async findAction(idempotencyKey: string): Promise<ChainActionReceipt | null> {
    return structuredClone(this.#actions.get(idempotencyKey) ?? null);
  }

  async submitAction(request: ChainActionRequest): Promise<ChainActionReceipt> {
    const existing = this.#actions.get(request.idempotencyKey);
    if (existing !== undefined) return structuredClone(existing);
    const attempt = (this.#attempts.get(request.idempotencyKey) ?? 0) + 1;
    this.#attempts.set(request.idempotencyKey, attempt);
    if (this.scenario === "TIMEOUT_THEN_SUCCESS" && attempt === 1) {
      throw new FundingSagaError("PARTNER_TIMEOUT", "Sandbox chain submission timed out.", true);
    }
    if (this.scenario === "FUND_REJECTED" && request.action === "FUND") {
      throw new FundingSagaError("PARTNER_REJECTED", "Sandbox facility funding was rejected.");
    }
    const requestHash = chainActionRequestHash(request);
    const unsigned = {
      action: request.action,
      envelopeHash: request.envelopeHash,
      ledgerSequence: 1_000_000 + attempt,
      network: request.network,
      requestHash,
      sandbox: true as const,
      status: "CONFIRMED" as const,
      transactionHash: canonicalHash({ action: request.action, requestHash }),
    };
    const receipt = { ...unsigned, receiptHash: canonicalHash(unsigned) };
    if (this.scenario === "PROTOCOL_MISMATCH") return { ...receipt, receiptHash: "0".repeat(64) };
    this.#actions.set(request.idempotencyKey, receipt);
    if (this.scenario === "LOST_RESPONSE" && attempt === 1) {
      throw new FundingSagaError("PARTNER_TIMEOUT", "Sandbox chain response was lost.", true);
    }
    return structuredClone(receipt);
  }
}
