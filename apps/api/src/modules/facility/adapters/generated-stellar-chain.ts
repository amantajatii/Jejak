import { Buffer } from "node:buffer";

import { AssetController, Facility } from "@jejak/stellar-client";

import { canonicalHash } from "../../../reliability/canonical-json.js";
import type { NodeRoleSigner } from "../../../runtime/stellar/node-role-signer.js";
import { FundingSagaError } from "../domain/errors.js";
import { chainActionRequestHash } from "../domain/chain-receipt.js";
import type { ChainActionReceipt, ChainActionRequest } from "../domain/types.js";
import type { FundingChainPort } from "../ports/funding-chain.js";

export type SubmittedFundingTransaction = {
  ledgerSequence?: number;
  transactionHash: string;
};

/**
 * Signing is deliberately injected. This adapter constructs generated Stellar
 * client transactions but never receives a seed phrase or private key.
 */
export interface FundingTransactionSubmitter {
  submit(input: {
    action: ChainActionRequest["action"];
    chainIdempotencyKey: string;
    requestHash: string;
    transaction: unknown;
  }): Promise<SubmittedFundingTransaction>;
}

export interface FundingSubmissionLookup {
  find(input: { chainIdempotencyKey: string; requestHash: string }): Promise<SubmittedFundingTransaction | null>;
}

type GeneratedStellarFundingChainOptions = {
  assetPublicKey?: string;
  assetSignTransaction?: NodeRoleSigner["signTransaction"];
  assetControllerContractId: string;
  facilityPublicKey?: string;
  facilitySignTransaction?: NodeRoleSigner["signTransaction"];
  facilityContractId: string;
  lookup: FundingSubmissionLookup;
  mode: "SANDBOX" | "PRODUCTION";
  networkPassphrase: string;
  /** @deprecated Prefer the role-specific source keys. */
  publicKey?: string;
  rpcUrl: string;
  submitter?: FundingTransactionSubmitter;
};

/**
 * A generated-client transaction boundary. A submission acknowledgement is
 * intentionally only SUBMITTED: BE-15 event/state reconciliation establishes
 * finality. Production instances without both RPC construction and signer
 * submitter remain unavailable rather than fabricating a success.
 */
export class GeneratedStellarFundingChain implements FundingChainPort {
  readonly mode: "SANDBOX" | "PRODUCTION";
  readonly configured: boolean;
  readonly #asset: AssetController.Client;
  readonly #facility: Facility.Client;

  constructor(private readonly options: GeneratedStellarFundingChainOptions) {
    this.mode = options.mode;
    this.configured = options.submitter !== undefined;
    const common = {
      networkPassphrase: options.networkPassphrase,
      rpcUrl: options.rpcUrl,
    };
    const assetPublicKey = options.assetPublicKey ?? options.publicKey;
    const facilityPublicKey = options.facilityPublicKey ?? options.publicKey;
    if (assetPublicKey === undefined || facilityPublicKey === undefined) {
      throw new Error("Role-specific Stellar funding source keys are required.");
    }
    this.#asset = new AssetController.Client({
      ...common,
      contractId: options.assetControllerContractId,
      publicKey: assetPublicKey,
      ...(options.assetSignTransaction === undefined ? {} : { signTransaction: options.assetSignTransaction }),
    });
    this.#facility = new Facility.Client({
      ...common,
      contractId: options.facilityContractId,
      publicKey: facilityPublicKey,
      ...(options.facilitySignTransaction === undefined ? {} : { signTransaction: options.facilitySignTransaction }),
    });
  }

  async findAction(request: ChainActionRequest): Promise<ChainActionReceipt | null> {
    validateRequest(request, this.options);
    const submission = await this.options.lookup.find({
      chainIdempotencyKey: request.idempotencyKey,
      requestHash: chainActionRequestHash(request),
    });
    return submission === null ? null : receipt(request, submission, this.mode === "SANDBOX");
  }

  async submitAction(request: ChainActionRequest): Promise<ChainActionReceipt> {
    validateRequest(request, this.options);
    if (this.options.submitter === undefined) {
      throw new FundingSagaError("PARTNER_REJECTED", "No real Stellar signer/submission boundary is configured.");
    }
    const found = await this.findAction(request);
    if (found !== null) return found;
    const transaction = await this.#construct(request);
    let submitted: SubmittedFundingTransaction;
    try {
      submitted = await this.options.submitter.submit({
        action: request.action,
        chainIdempotencyKey: request.idempotencyKey,
        requestHash: chainActionRequestHash(request),
        transaction,
      });
    } catch (error) {
      if (isTransport(error)) throw new FundingSagaError("PARTNER_TIMEOUT", "Stellar submission transport failed.", true);
      throw new FundingSagaError("PARTNER_REJECTED", "Stellar submission was rejected.");
    }
    return receipt(request, submitted, this.mode === "SANDBOX");
  }

  async #construct(request: ChainActionRequest): Promise<unknown> {
    const claimKey = Buffer.from(request.claimKey, "hex");
    const amount = BigInt(request.source.amountMinor);
    switch (request.action) {
      case "ISSUE":
        return this.#asset.issue({
          amount,
          claim_key: claimKey,
          facility_holder: request.facilityHolder,
          issuer_operator: request.issuerOperator,
        });
      case "FUND":
        return this.#facility.fund({
          claim_key: claimKey,
          first_loss: BigInt(request.firstLossAmountMinor),
          operator: request.facilityOperator,
          principal: amount,
          seller_payout_account: request.sellerPayoutAccount,
          source: request.facilityTreasury,
        });
      case "COMPENSATE":
        return this.#asset.redeem({
          amount,
          claim_key: claimKey,
          facility_holder: request.facilityHolder,
          issuer_operator: request.issuerOperator,
        });
      case "ISSUE_AND_FUND":
        throw new FundingSagaError("VALIDATION_FAILED", "The configured contracts expose separate issue and fund calls; atomic submission is unavailable.");
    }
  }

}

function receipt(request: ChainActionRequest, submission: SubmittedFundingTransaction, sandbox: boolean): ChainActionReceipt {
  if (!/^[a-f0-9]{64}$/i.test(submission.transactionHash)) {
    throw new FundingSagaError("PARTNER_REJECTED", "Stellar submission returned an invalid transaction hash.");
  }
  const unsigned = {
    action: request.action,
    envelopeHash: request.envelopeHash,
    ...(submission.ledgerSequence === undefined ? {} : { ledgerSequence: submission.ledgerSequence }),
    network: request.network,
    requestHash: chainActionRequestHash(request),
    sandbox,
    status: "SUBMITTED" as const,
    transactionHash: submission.transactionHash.toLowerCase(),
  };
  return { ...unsigned, receiptHash: canonicalHash(unsigned) };
}

function validateRequest(request: ChainActionRequest, options: GeneratedStellarFundingChainOptions): void {
  for (const [name, value] of Object.entries({
    acceptedTermsHash: request.acceptedTermsHash,
    claimKey: request.claimKey,
    resultHash: request.resultHash,
  })) if (!/^[a-f0-9]{64}$/i.test(value)) throw new FundingSagaError("VALIDATION_FAILED", `${name} must be a SHA-256 hex value.`);
  if (!/^[1-9][0-9]*$/.test(request.source.amountMinor) || !/^(0|[1-9][0-9]*)$/.test(request.firstLossAmountMinor)) {
    throw new FundingSagaError("VALIDATION_FAILED", "Funding amounts must use exact non-floating-point integers.");
  }
  if (request.assetControllerContractId !== options.assetControllerContractId || request.facilityContractId !== options.facilityContractId) {
    throw new FundingSagaError("PARTNER_REJECTED", "Funding request contract identities do not match configured contracts.");
  }
  if (request.network !== options.networkPassphrase) {
    throw new FundingSagaError("PARTNER_REJECTED", "Funding request network does not match configured Stellar network.");
  }
}

function isTransport(error: unknown): boolean {
  return (typeof error === "object" && error !== null && "retryable" in error && error.retryable === true) ||
    (error instanceof Error && /timeout|timed out|network|transport|rpc|ambiguous/i.test(error.message));
}
