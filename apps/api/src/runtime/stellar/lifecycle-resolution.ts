import type { ClaimLifecycle, ResolutionManager } from "@jejak/stellar-client";

import type { StellarSubmissionIdentity, StellarSubmissionReceipt } from "./signer.js";

type LifecycleClient = Pick<ClaimLifecycle.Client, "confirm_control" | "create_claim" | "pause" | "resume" | "transition">;
type ResolutionClient = Pick<ResolutionManager.Client, "close" | "get_resolution" | "open" | "record_recovery">;

type ActionSubmitter = {
  submit(input: StellarSubmissionIdentity & { transaction: unknown }): Promise<StellarSubmissionReceipt>;
};

type Identity = Omit<StellarSubmissionIdentity, "network">;

/** Generated mutation bindings for lifecycle and resolution actions not owned by funding/waterfall adapters. */
export class GeneratedLifecycleResolutionActions {
  constructor(private readonly dependencies: {
    claimLifecycle: LifecycleClient;
    resolutionManager: ResolutionClient;
    submitter: ActionSubmitter;
  }) {}

  async getResolution(claimKey: string): Promise<{
    finalLoss: string;
    openingEvidenceHash: string;
    reasonCode: string;
    recovered: string;
    resolver: string;
    status: number;
  } | undefined> {
    const transaction = await this.dependencies.resolutionManager.get_resolution({
      claim_key: bytes(claimKey, "claim key"),
    });
    if (transaction.result.isErr()) return undefined;
    const resolution = transaction.result.unwrap();
    return {
      finalLoss: resolution.final_loss.toString(),
      openingEvidenceHash: Buffer.from(resolution.opening_evidence_hash).toString("hex"),
      reasonCode: resolution.reason_code,
      recovered: resolution.recovered.toString(),
      resolver: resolution.resolver,
      status: Number(resolution.status),
    };
  }

  createClaim(input: Identity & {
    approvedPrincipalBaseUnits: string;
    attestationKey: string;
    claimKey: string;
    facilityId: string;
    originator: string;
    sellerSubjectHash: string;
    sourceAmount: string;
    sourceCurrencyHash: string;
  }): Promise<StellarSubmissionReceipt> {
    return this.#constructAndSubmit(input, () => this.dependencies.claimLifecycle.create_claim({
      approved_principal_base_units: positive(input.approvedPrincipalBaseUnits, "approved principal"),
      attestation_key: bytes(input.attestationKey, "attestation key"),
      claim_key: bytes(input.claimKey, "claim key"),
      facility_id: bytes(input.facilityId, "facility ID"),
      originator: input.originator,
      seller_subject_hash: bytes(input.sellerSubjectHash, "seller subject hash"),
      source_amount: positive(input.sourceAmount, "source amount"),
      source_currency_hash: bytes(input.sourceCurrencyHash, "source currency hash"),
    }));
  }

  confirmControl(input: Identity & { actor: string; claimKey: string; evidenceHash: string; expiresAt: bigint }): Promise<StellarSubmissionReceipt> {
    return this.#constructAndSubmit(input, () => this.dependencies.claimLifecycle.confirm_control({
      actor: input.actor,
      claim_key: bytes(input.claimKey, "claim key"),
      evidence_hash: bytes(input.evidenceHash, "evidence hash"),
      expires_at: input.expiresAt,
    }));
  }

  transition(input: Identity & {
    actor: string;
    claimKey: string;
    expectedState: ClaimLifecycle.OnchainClaimState;
    nextState: ClaimLifecycle.OnchainClaimState;
    reasonCode: string;
  }): Promise<StellarSubmissionReceipt> {
    return this.#constructAndSubmit(input, () => this.dependencies.claimLifecycle.transition({
      actor: input.actor,
      claim_key: bytes(input.claimKey, "claim key"),
      expected_state: input.expectedState,
      next_state: input.nextState,
      reason_code: input.reasonCode,
    }));
  }

  pause(input: Identity & { claimKey: string; pauser: string; reasonCode: string }): Promise<StellarSubmissionReceipt> {
    return this.#constructAndSubmit(input, () => this.dependencies.claimLifecycle.pause({
      claim_key: bytes(input.claimKey, "claim key"),
      pauser: input.pauser,
      reason_code: input.reasonCode,
    }));
  }

  openResolution(input: Identity & { claimKey: string; evidenceHash: string; reasonCode: string; resolver: string }): Promise<StellarSubmissionReceipt> {
    return this.#constructAndSubmit(input, () => this.dependencies.resolutionManager.open({
      claim_key: bytes(input.claimKey, "claim key"),
      evidence_hash: bytes(input.evidenceHash, "evidence hash"),
      reason_code: input.reasonCode,
      resolver: input.resolver,
    }));
  }

  recordRecovery(input: Identity & { amount: string; claimKey: string; evidenceHash: string; resolver: string }): Promise<StellarSubmissionReceipt> {
    return this.#constructAndSubmit(input, () => this.dependencies.resolutionManager.record_recovery({
      amount: nonnegative(input.amount, "recovery amount"),
      claim_key: bytes(input.claimKey, "claim key"),
      evidence_hash: bytes(input.evidenceHash, "evidence hash"),
      resolver: input.resolver,
    }));
  }

  closeResolution(input: Identity & {
    claimKey: string;
    finalLoss: string;
    recovered: string;
    resolutionHash: string;
    resolver: string;
  }): Promise<StellarSubmissionReceipt> {
    return this.#constructAndSubmit(input, () => this.dependencies.resolutionManager.close({
      claim_key: bytes(input.claimKey, "claim key"),
      final_loss: nonnegative(input.finalLoss, "final loss"),
      recovered: nonnegative(input.recovered, "recovered amount"),
      resolution_hash: bytes(input.resolutionHash, "resolution hash"),
      resolver: input.resolver,
    }));
  }

  async #constructAndSubmit(
    identity: Identity,
    construct: () => Promise<{ result: { isErr(): boolean; unwrapErr(): { message: string } } }>,
  ): Promise<StellarSubmissionReceipt> {
    const transaction = await construct();
    if (transaction.result.isErr()) throw new Error(`Generated Stellar action simulation failed: ${transaction.result.unwrapErr().message}.`);
    return this.dependencies.submitter.submit({ ...identity, network: "TESTNET", transaction });
  }
}

function bytes(value: string, label: string): Buffer {
  if (!/^[0-9a-f]{64}$/.test(value)) throw new Error(`${label} must be lowercase 32-byte hex.`);
  return Buffer.from(value, "hex");
}

function positive(value: string, label: string): bigint {
  if (!/^[1-9][0-9]*$/.test(value)) throw new Error(`${label} must be a positive exact integer.`);
  return BigInt(value);
}

function nonnegative(value: string, label: string): bigint {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) throw new Error(`${label} must be a non-negative exact integer.`);
  return BigInt(value);
}
