export type StellarSubmissionReceipt = { ledgerSequence?: number; transactionHash: string };

export type StellarSubmissionIdentity = {
  network: "TESTNET";
  requestHash: string;
  submissionId: string;
};

/** A capability supplied by an external vault/custody boundary. It never exposes a seed. */
export interface ExternalStellarSigningCapability {
  readonly publicKey: string;
  submit(input: StellarSubmissionIdentity & { transaction: unknown }): Promise<StellarSubmissionReceipt>;
}

export interface ExternalStellarSigningProvider {
  lookup(input: StellarSubmissionIdentity): Promise<StellarSubmissionReceipt | null>;
  resolve(reference: string): Promise<ExternalStellarSigningCapability | undefined>;
}

export class StellarSubmissionError extends Error {
  readonly retryable: boolean;

  constructor(
    readonly code: "AMBIGUOUS_SUBMISSION" | "CONFIGURATION" | "PROTOCOL_MISMATCH" | "SUBMISSION_REJECTED",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "StellarSubmissionError";
    this.retryable = code === "AMBIGUOUS_SUBMISSION";
  }
}

/**
 * Lookup-before-submit and lookup-after-ambiguous-response are mandatory.
 * The transaction source is checked against the capability resolved by reference.
 */
export class ExternalReferenceStellarSubmitter {
  constructor(private readonly options: {
    expectedPublicKey: string;
    provider: ExternalStellarSigningProvider;
    secretReference: string;
  }) {
    if (!/^(env:\/\/[A-Z][A-Z0-9_]*|secret:\/\/[A-Za-z0-9._/-]+)$/.test(options.secretReference)) {
      throw new StellarSubmissionError("CONFIGURATION", "Stellar signing must use an external env:// or secret:// reference.");
    }
  }

  async lookup(input: StellarSubmissionIdentity): Promise<StellarSubmissionReceipt | null> {
    validateIdentity(input);
    const found = await this.options.provider.lookup(input);
    return found === null ? null : validateReceipt(found);
  }

  async submit(input: StellarSubmissionIdentity & { transaction: unknown }): Promise<StellarSubmissionReceipt> {
    validateIdentity(input);
    const recovered = await this.lookup(input);
    if (recovered !== null) return recovered;

    const capability = await this.options.provider.resolve(this.options.secretReference);
    if (capability === undefined || capability.publicKey !== this.options.expectedPublicKey) {
      throw new StellarSubmissionError("CONFIGURATION", "Configured Stellar signing capability is unavailable or has the wrong public key.");
    }
    try {
      return validateReceipt(await capability.submit(input));
    } catch (error) {
      const after = await this.lookup(input);
      if (after !== null) return after;
      if (isAmbiguous(error)) {
        throw new StellarSubmissionError("AMBIGUOUS_SUBMISSION", "Stellar submission outcome is ambiguous; lookup is required before retry.", { cause: error });
      }
      throw new StellarSubmissionError("SUBMISSION_REJECTED", "External Stellar signing provider rejected the submission.", { cause: error });
    }
  }
}

/** Adapter factories consumed by Session 4 composition without exposing signing material. */
export function createRegistryTransactionBoundary(submitter: ExternalReferenceStellarSubmitter) {
  return {
    lookup: (input: { requestHash: string; submissionId: string }) => submitter.lookup({ ...input, network: "TESTNET" }),
    submit: (input: { requestHash: string; submissionId: string; transaction: unknown }) => submitter.submit({ ...input, network: "TESTNET" }),
  };
}

export function createWaterfallTransactionBoundary(submitter: ExternalReferenceStellarSubmitter) {
  return {
    submit: (input: { resultHash: string; transaction: unknown }) => submitter.submit({
      network: "TESTNET",
      requestHash: input.resultHash,
      submissionId: `waterfall:${input.resultHash}`,
      transaction: input.transaction,
    }),
  };
}

export function createFundingTransactionBoundaries(submitter: ExternalReferenceStellarSubmitter) {
  return {
    lookup: {
      find: (input: { chainIdempotencyKey: string; requestHash: string }) => submitter.lookup({
        network: "TESTNET",
        requestHash: input.requestHash,
        submissionId: input.chainIdempotencyKey,
      }),
    },
    submitter: {
      submit: (input: { chainIdempotencyKey: string; requestHash: string; transaction: unknown }) => submitter.submit({
        network: "TESTNET",
        requestHash: input.requestHash,
        submissionId: input.chainIdempotencyKey,
        transaction: input.transaction,
      }),
    },
  };
}

function validateIdentity(input: StellarSubmissionIdentity): void {
  if (input.network !== "TESTNET") throw new StellarSubmissionError("PROTOCOL_MISMATCH", "External signer accepts only explicit TESTNET submissions.");
  if (!/^[0-9a-f]{64}$/.test(input.requestHash)) throw new StellarSubmissionError("PROTOCOL_MISMATCH", "Stellar request hash must be lowercase SHA-256 hex.");
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(input.submissionId)) throw new StellarSubmissionError("PROTOCOL_MISMATCH", "Stellar submission identity is invalid.");
}

function validateReceipt(receipt: StellarSubmissionReceipt): StellarSubmissionReceipt {
  if (!/^[0-9a-f]{64}$/.test(receipt.transactionHash)) {
    throw new StellarSubmissionError("PROTOCOL_MISMATCH", "Stellar provider returned an invalid transaction hash.");
  }
  if (receipt.ledgerSequence !== undefined && (!Number.isSafeInteger(receipt.ledgerSequence) || receipt.ledgerSequence < 1)) {
    throw new StellarSubmissionError("PROTOCOL_MISMATCH", "Stellar provider returned an invalid ledger sequence.");
  }
  return { ...receipt };
}

function isAmbiguous(error: unknown): boolean {
  return !(error instanceof StellarSubmissionError) && error instanceof Error && /timeout|timed out|network|transport|response.*lost|unavailable/i.test(error.message);
}
