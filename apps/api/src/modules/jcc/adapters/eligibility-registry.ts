import { Buffer } from "node:buffer";

import { EligibilityRegistry } from "@jejak/stellar-client";
import type { contract } from "@stellar/stellar-sdk";

import { canonicalHash } from "../../../reliability/canonical-json.js";
import type {
  JccRegistry,
  RegistryAttestationRef,
  RegistryRecord,
  RegistrySubmission,
  RegistrySubmissionRecovery,
} from "../ports/index.js";

type RegistryClient = Pick<
  EligibilityRegistry.Client,
  "get_attestation" | "is_active" | "register_attestation" | "revoke_attestation"
>;

export interface RegistryTransactionSubmitter {
  lookup(input: { requestHash: string; submissionId: string }): Promise<{ ledgerSequence?: number; transactionHash: string } | null>;
  submit(input: { requestHash: string; submissionId: string; transaction: unknown }): Promise<{ ledgerSequence?: number; transactionHash: string }>;
}

function bytes32(value: string, label: string): Buffer {
  if (!/^[0-9a-f]{64}$/.test(value)) throw new Error(`${label} must be canonical 32-byte hex.`);
  return Buffer.from(value, "hex");
}

function unwrap<T>(result: contract.Result<T>, label: string): T {
  if (result.isErr()) throw new Error(`Eligibility Registry ${label} failed: ${result.unwrapErr().message}.`);
  return result.unwrap();
}

function epochSeconds(value: string): bigint {
  const milliseconds = new Date(value).valueOf();
  if (Number.isNaN(milliseconds) || !value.endsWith("Z")) throw new Error("Registry timestamp must be UTC.");
  return BigInt(Math.floor(milliseconds / 1_000));
}

function contractRef(input: RegistryAttestationRef): EligibilityRegistry.AttestationRef {
  return {
    attestation_key: bytes32(input.attestationKey, "attestationKey"),
    claim_key: bytes32(input.claimKey, "claimKey"),
    data_snapshot_hash: bytes32(input.dataSnapshotHash, "dataSnapshotHash"),
    envelope_hash: bytes32(input.envelopeHash, "envelopeHash"),
    esv_base_units: BigInt(input.esvBaseUnits),
    expires_at: epochSeconds(input.expiresAt),
    oracle: input.oracle,
    sds_bps: input.sdsBps,
  };
}

function record(ref: EligibilityRegistry.AttestationRef, status: RegistryRecord["status"]): RegistryRecord {
  const expiresAt = new Date(Number(ref.expires_at) * 1_000).toISOString().replace(".000Z", "Z");
  return {
    attestationKey: Buffer.from(ref.attestation_key).toString("hex"),
    claimKey: Buffer.from(ref.claim_key).toString("hex"),
    dataSnapshotHash: Buffer.from(ref.data_snapshot_hash).toString("hex"),
    envelopeHash: Buffer.from(ref.envelope_hash).toString("hex"),
    esvBaseUnits: ref.esv_base_units.toString(),
    expiresAt,
    oracle: ref.oracle,
    sdsBps: ref.sds_bps,
    status,
  };
}

export class EligibilityRegistryAdapter implements JccRegistry, RegistrySubmissionRecovery {
  constructor(
    private readonly client: RegistryClient,
    private readonly submitter: RegistryTransactionSubmitter,
  ) {}

  async find(input: {
    attestationKey: string;
    envelopeHash: string;
    submissionId: string;
  }): Promise<RegistrySubmission | null> {
    const submitted = await this.submitter.lookup({
      requestHash: submissionRequestHash(input),
      submissionId: input.submissionId,
    });
    return submitted === null ? null : submission(input, submitted);
  }

  async register(input: RegistryAttestationRef & { submissionId: string }): Promise<RegistrySubmission> {
    const transaction = await this.client.register_attestation({
      oracle: input.oracle,
      attestation: contractRef(input),
    });
    unwrap(transaction.result, "register simulation");
    const submitted = await this.submitter.submit({
      requestHash: submissionRequestHash(input),
      submissionId: input.submissionId,
      transaction,
    });
    return submission(input, submitted);
  }

  async read(input: { attestationKey: string; now: string }): Promise<RegistryRecord | null> {
    const attestationKey = bytes32(input.attestationKey, "attestationKey");
    const transaction = await this.client.get_attestation({ attestation_key: attestationKey });
    if (transaction.result.isErr()) {
      if (transaction.result.unwrapErr().message === "NotFound") return null;
      unwrap(transaction.result, "read");
    }
    const ref = transaction.result.unwrap();
    const active = (await this.client.is_active({
      attestation_key: attestationKey,
      now: epochSeconds(input.now),
    })).result;
    const expired = epochSeconds(input.now) >= ref.expires_at;
    return record(ref, active ? "ACTIVE" : expired ? "EXPIRED" : "REVOKED");
  }

  async revoke(input: {
    actor: string;
    attestationKey: string;
    envelopeHash: string;
    reasonCode: string;
    submissionId: string;
  }): Promise<RegistrySubmission> {
    const transaction = await this.client.revoke_attestation({
      actor: input.actor,
      attestation_key: bytes32(input.attestationKey, "attestationKey"),
      reason_code: input.reasonCode,
    });
    unwrap(transaction.result, "revoke simulation");
    const submitted = await this.submitter.submit({
      requestHash: submissionRequestHash(input),
      submissionId: input.submissionId,
      transaction,
    });
    return submission(input, submitted);
  }
}

function submissionRequestHash(input: { attestationKey: string; envelopeHash: string; submissionId: string }): string {
  return canonicalHash({
    attestationKey: input.attestationKey,
    envelopeHash: input.envelopeHash,
    submissionId: input.submissionId,
  });
}

function submission(
  input: { attestationKey: string; envelopeHash: string; submissionId: string },
  submitted: { ledgerSequence?: number; transactionHash: string },
): RegistrySubmission {
  return {
    submissionId: input.submissionId,
    attestationKey: input.attestationKey,
    envelopeHash: input.envelopeHash,
    transactionHash: submitted.transactionHash,
    ...(submitted.ledgerSequence === undefined ? {} : { ledgerSequence: submitted.ledgerSequence }),
  };
}
