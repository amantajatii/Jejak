import type { AssembledTransaction } from "@stellar/stellar-sdk/contract";

import { DomainError } from "../../shared/errors.js";
import type { RegistryTransactionSubmitter } from "./eligibility-registry.js";

/** Minimal view of the SDK's SentTransaction we depend on. */
type SentLike = {
  getTransactionResponse?: { ledger?: number; status?: string };
  sendTransactionResponse?: { hash?: string };
};

/**
 * Concrete submitter that signs and sends a prepared eligibility-registry
 * transaction to Stellar Testnet. The transaction is built by an
 * EligibilityRegistry.Client whose source account is the oracle, so a single
 * signature (via the client's configured signTransaction) satisfies the
 * contract's `oracle.require_auth()`.
 *
 * Application-level idempotency is enforced by the JccSubmissionJournal, so
 * lookup returns null here; the on-chain contract additionally rejects a replay.
 */
export class StellarRegistryTransactionSubmitter implements RegistryTransactionSubmitter {
  async lookup(): Promise<{ ledgerSequence?: number; transactionHash: string } | null> {
    return null;
  }

  async submit(input: {
    requestHash: string;
    submissionId: string;
    transaction: unknown;
  }): Promise<{ ledgerSequence?: number; transactionHash: string }> {
    const assembled = input.transaction as AssembledTransaction<unknown>;
    let sent: SentLike;
    try {
      sent = (await assembled.signAndSend()) as SentLike;
    } catch {
      throw new DomainError(
        "PARTNER_TIMEOUT",
        "Eligibility Registry transaction submission failed or its outcome is unavailable.",
        true,
      );
    }
    const status = sent.getTransactionResponse?.status;
    if (status !== undefined && status !== "SUCCESS") {
      throw new DomainError("PARTNER_REJECTED", `Eligibility Registry transaction did not succeed (${status}).`);
    }
    const transactionHash = sent.sendTransactionResponse?.hash;
    if (transactionHash === undefined || !/^[0-9a-f]{64}$/i.test(transactionHash)) {
      throw new DomainError("PARTNER_TIMEOUT", "Eligibility Registry submission returned no usable transaction hash.", true);
    }
    const ledgerSequence = sent.getTransactionResponse?.ledger;
    return {
      transactionHash: transactionHash.toLowerCase(),
      ...(typeof ledgerSequence === "number" && Number.isSafeInteger(ledgerSequence) && ledgerSequence > 0
        ? { ledgerSequence }
        : {}),
    };
  }
}
