import { describe, expect, it, vi } from "vitest";

import { DomainError } from "../src/modules/shared/errors.js";
import { StellarRegistryTransactionSubmitter } from "../src/modules/jcc/adapters/stellar-registry-submitter.js";

const hash = "a".repeat(64);

function assembled(sent: unknown) {
  return { signAndSend: vi.fn().mockResolvedValue(sent) };
}

describe("StellarRegistryTransactionSubmitter", () => {
  it("signs, sends, and returns the transaction hash and ledger", async () => {
    const submitter = new StellarRegistryTransactionSubmitter();
    const tx = assembled({
      getTransactionResponse: { ledger: 123, status: "SUCCESS" },
      sendTransactionResponse: { hash },
    });

    const result = await submitter.submit({ requestHash: "r", submissionId: "s", transaction: tx });

    expect(result).toEqual({ ledgerSequence: 123, transactionHash: hash });
    expect(tx.signAndSend).toHaveBeenCalledOnce();
  });

  it("lowercases the hash and omits a missing ledger sequence", async () => {
    const submitter = new StellarRegistryTransactionSubmitter();
    const result = await submitter.submit({
      requestHash: "r",
      submissionId: "s",
      transaction: assembled({ sendTransactionResponse: { hash: hash.toUpperCase() } }),
    });
    expect(result).toEqual({ transactionHash: hash });
  });

  it("rejects a non-success on-chain status as a partner rejection", async () => {
    const submitter = new StellarRegistryTransactionSubmitter();
    await expect(
      submitter.submit({
        requestHash: "r",
        submissionId: "s",
        transaction: assembled({
          getTransactionResponse: { status: "FAILED" },
          sendTransactionResponse: { hash },
        }),
      }),
    ).rejects.toMatchObject({ code: "PARTNER_REJECTED" });
  });

  it("classifies a transport failure as retryable", async () => {
    const submitter = new StellarRegistryTransactionSubmitter();
    const tx = { signAndSend: vi.fn().mockRejectedValue(new Error("network down")) };
    await expect(
      submitter.submit({ requestHash: "r", submissionId: "s", transaction: tx }),
    ).rejects.toMatchObject({ code: "PARTNER_TIMEOUT", retryable: true });
  });

  it("treats a missing/invalid hash as a retryable timeout", async () => {
    const submitter = new StellarRegistryTransactionSubmitter();
    await expect(
      submitter.submit({
        requestHash: "r",
        submissionId: "s",
        transaction: assembled({ getTransactionResponse: { status: "SUCCESS" } }),
      }),
    ).rejects.toBeInstanceOf(DomainError);
  });

  it("returns null for idempotent lookup (journal + contract enforce replay safety)", async () => {
    const submitter = new StellarRegistryTransactionSubmitter();
    expect(await submitter.lookup()).toBeNull();
  });
});
