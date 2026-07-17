import { Keypair } from "@stellar/stellar-sdk";
import { basicNodeSigner } from "@stellar/stellar-sdk/contract";

import type { StellarSubmissionReceipt } from "./signer.js";

type SignAuthEntry = ReturnType<typeof basicNodeSigner>["signAuthEntry"];
type SignTransaction = ReturnType<typeof basicNodeSigner>["signTransaction"];

type AssembledTransactionLike = {
  needsNonInvokerSigningBy?(): string[];
  signAuthEntries?(input: { address: string; signAuthEntry: SignAuthEntry }): Promise<void>;
  signAndSend(): Promise<{
    getTransactionResponse?: { ledger?: number; status?: string };
    sendTransactionResponse?: { hash?: string };
  }>;
};

/**
 * In-process Testnet signer used only after an external secret reference has
 * been resolved by runtime composition. The seed never crosses this boundary.
 */
export class NodeRoleSigner {
  readonly publicKey: string;
  readonly signAuthEntry: SignAuthEntry;
  readonly signTransaction: SignTransaction;

  private constructor(keypair: Keypair, networkPassphrase: string) {
    this.publicKey = keypair.publicKey();
    const signer = basicNodeSigner(keypair, networkPassphrase);
    this.signAuthEntry = signer.signAuthEntry;
    this.signTransaction = signer.signTransaction;
  }

  static fromSecret(input: {
    expectedPublicKey: string;
    networkPassphrase: string;
    secret: string;
  }): NodeRoleSigner {
    let keypair: Keypair;
    try {
      keypair = Keypair.fromSecret(input.secret);
    } catch {
      throw new Error("Resolved Stellar role secret is invalid.");
    }
    const signer = new NodeRoleSigner(keypair, input.networkPassphrase);
    if (signer.publicKey !== input.expectedPublicKey) {
      throw new Error("Resolved Stellar role secret does not match the promoted manifest.");
    }
    return signer;
  }

  async submit(
    transaction: unknown,
    nonInvokerSigners: readonly NodeRoleSigner[] = [],
  ): Promise<StellarSubmissionReceipt> {
    const assembled = transaction as Partial<AssembledTransactionLike>;
    if (typeof assembled.signAndSend !== "function") {
      throw new Error("Generated Stellar transaction is not submit-capable.");
    }

    const required = assembled.needsNonInvokerSigningBy?.() ?? [];
    if (required.length > 0 && typeof assembled.signAuthEntries !== "function") {
      throw new Error("Generated Stellar transaction cannot accept required authorization entries.");
    }
    const available = new Map(nonInvokerSigners.map((signer) => [signer.publicKey, signer]));
    for (const address of required) {
      const signer = available.get(address);
      if (signer === undefined) {
        throw new Error(`Missing configured non-invoker Stellar signer for ${address}.`);
      }
      await assembled.signAuthEntries!({ address, signAuthEntry: signer.signAuthEntry });
    }
    const missing = assembled.needsNonInvokerSigningBy?.() ?? [];
    if (missing.length > 0) {
      throw new Error(`Stellar authorization entries remain unsigned for ${missing.join(",")}.`);
    }

    const sent = await assembled.signAndSend();
    const status = sent.getTransactionResponse?.status;
    const transactionHash = sent.sendTransactionResponse?.hash;
    if (status !== "SUCCESS" || transactionHash === undefined || !/^[0-9a-f]{64}$/i.test(transactionHash)) {
      throw new Error(`Stellar transaction did not finalize successfully (${status ?? "UNKNOWN"}).`);
    }
    const ledgerSequence = sent.getTransactionResponse?.ledger;
    if (ledgerSequence !== undefined && (!Number.isSafeInteger(ledgerSequence) || ledgerSequence < 1)) {
      throw new Error("Stellar transaction returned an invalid ledger sequence.");
    }
    return {
      ...(ledgerSequence === undefined ? {} : { ledgerSequence }),
      transactionHash: transactionHash.toLowerCase(),
    };
  }
}
