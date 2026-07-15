import { canonicalHash } from "../../../reliability/canonical-json.js";
import type {
  WaterfallSubmissionCommand,
  WaterfallSubmissionPort,
  WaterfallSubmissionReceipt,
} from "../ports/settlement.js";
import { WaterfallSubmissionError } from "../ports/settlement.js";

export type WaterfallSandboxScenario = "LOST_RESPONSE" | "SUCCESS" | "TIMEOUT_THEN_SUCCESS";

/** Deterministic, explicitly sandbox-only chain submitter for local/demo use. */
export class DeterministicWaterfallSubmitter implements WaterfallSubmissionPort {
  readonly mode = "SANDBOX" as const;
  readonly #receipts = new Map<string, WaterfallSubmissionReceipt>();
  readonly #attempts = new Map<string, number>();

  constructor(private readonly scenario: WaterfallSandboxScenario = "SUCCESS") {}

  async submit(command: WaterfallSubmissionCommand): Promise<WaterfallSubmissionReceipt> {
    const identity = command.allocation.resultHash;
    const existing = this.#receipts.get(identity);
    if (existing !== undefined) return structuredClone(existing);
    const attempt = (this.#attempts.get(identity) ?? 0) + 1;
    this.#attempts.set(identity, attempt);
    if (this.scenario === "TIMEOUT_THEN_SUCCESS" && attempt === 1) {
      throw new WaterfallSubmissionError("RPC_TIMEOUT", "Sandbox waterfall submission timed out.", false);
    }
    const envelopeHash = canonicalHash({
      allocation: command.allocation,
      claimKey: command.claimKey,
      servicerAddress: command.servicerAddress,
    });
    const receipt = {
      envelopeHash,
      ledgerSequence: 1_000_000 + attempt,
      transactionHash: canonicalHash({ envelopeHash, kind: "sandbox-waterfall" }),
    };
    this.#receipts.set(identity, receipt);
    if (this.scenario === "LOST_RESPONSE" && attempt === 1) {
      throw new WaterfallSubmissionError("RPC_TIMEOUT", "Sandbox waterfall response was lost.", true);
    }
    return structuredClone(receipt);
  }
}
