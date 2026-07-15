import { EligibilityRegistry } from "@jejak/stellar-client";
import type { contract } from "@stellar/stellar-sdk";
import { describe, expect, it, vi } from "vitest";

import { EligibilityRegistryAdapter } from "../src/modules/jcc/adapters/eligibility-registry.js";

function ok<T>(value: T): contract.Result<T> {
  return {
    isErr: () => false,
    isOk: () => true,
    unwrap: () => value,
    unwrapErr: () => {
      throw new Error("not an error");
    },
  } as unknown as contract.Result<T>;
}

const registryRef = {
  attestationKey: "a".repeat(64),
  claimKey: "b".repeat(64),
  dataSnapshotHash: "c".repeat(64),
  envelopeHash: "d".repeat(64),
  esvBaseUnits: "8000",
  expiresAt: "2026-07-16T00:00:00Z",
  oracle: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
  sdsBps: 800,
};
const expiresAtEpoch = BigInt(Date.parse(registryRef.expiresAt) / 1_000);

describe("generated Eligibility Registry adapter", () => {
  it("maps exact integer/hash values and delegates transaction signing", async () => {
    const contractValue: EligibilityRegistry.AttestationRef = {
      attestation_key: Buffer.from(registryRef.attestationKey, "hex"),
      claim_key: Buffer.from(registryRef.claimKey, "hex"),
      data_snapshot_hash: Buffer.from(registryRef.dataSnapshotHash, "hex"),
      envelope_hash: Buffer.from(registryRef.envelopeHash, "hex"),
      esv_base_units: 8000n,
      expires_at: expiresAtEpoch,
      oracle: registryRef.oracle,
      sds_bps: registryRef.sdsBps,
    };
    const registerTransaction = { result: ok<void>(undefined) };
    const revokeTransaction = { result: ok<void>(undefined) };
    const client = {
      register_attestation: vi.fn().mockResolvedValue(registerTransaction),
      revoke_attestation: vi.fn().mockResolvedValue(revokeTransaction),
      get_attestation: vi.fn().mockResolvedValue({ result: ok(contractValue) }),
      is_active: vi.fn().mockResolvedValue({ result: true }),
    };
    const submit = vi
      .fn()
      .mockResolvedValueOnce({ transactionHash: "e".repeat(64), ledgerSequence: 123 })
      .mockResolvedValueOnce({ transactionHash: "f".repeat(64) });
    const adapter = new EligibilityRegistryAdapter(client as never, { submit });

    const registered = await adapter.register({ ...registryRef, submissionId: "submission-1" });
    expect(registered).toEqual({
      submissionId: "submission-1",
      attestationKey: registryRef.attestationKey,
      envelopeHash: registryRef.envelopeHash,
      transactionHash: "e".repeat(64),
      ledgerSequence: 123,
    });
    expect(client.register_attestation).toHaveBeenCalledWith({
      oracle: registryRef.oracle,
      attestation: contractValue,
    });
    expect(submit).toHaveBeenNthCalledWith(1, registerTransaction);

    await expect(
      adapter.read({ attestationKey: registryRef.attestationKey, now: "2026-07-15T00:00:00Z" }),
    ).resolves.toEqual({ ...registryRef, status: "ACTIVE" });

    const revoked = await adapter.revoke({
      actor: registryRef.oracle,
      attestationKey: registryRef.attestationKey,
      envelopeHash: registryRef.envelopeHash,
      reasonCode: "POLICY_REVOKED",
      submissionId: "submission-2",
    });
    expect(revoked.transactionHash).toBe("f".repeat(64));
    expect(submit).toHaveBeenNthCalledWith(2, revokeTransaction);
  });

  it("derives expired status from contract time without mutating the record", async () => {
    const contractValue: EligibilityRegistry.AttestationRef = {
      attestation_key: Buffer.from(registryRef.attestationKey, "hex"),
      claim_key: Buffer.from(registryRef.claimKey, "hex"),
      data_snapshot_hash: Buffer.from(registryRef.dataSnapshotHash, "hex"),
      envelope_hash: Buffer.from(registryRef.envelopeHash, "hex"),
      esv_base_units: 8000n,
      expires_at: expiresAtEpoch,
      oracle: registryRef.oracle,
      sds_bps: registryRef.sdsBps,
    };
    const adapter = new EligibilityRegistryAdapter(
      {
        get_attestation: vi.fn().mockResolvedValue({ result: ok(contractValue) }),
        is_active: vi.fn().mockResolvedValue({ result: false }),
        register_attestation: vi.fn(),
        revoke_attestation: vi.fn(),
      } as never,
      { submit: vi.fn() },
    );
    await expect(
      adapter.read({ attestationKey: registryRef.attestationKey, now: "2026-07-16T00:00:00Z" }),
    ).resolves.toMatchObject({ envelopeHash: registryRef.envelopeHash, status: "EXPIRED" });
  });
});
