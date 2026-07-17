import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";

import { contractNames } from "../src/modules/chain/domain/events.js";
import {
  buildSafeStellarTransactionReference,
  createStellarGeneratedClients,
  ExternalReferenceStellarSubmitter,
  GeneratedLifecycleResolutionActions,
  loadPromotedTestnetManifest,
  NodeRoleSigner,
  parsePromotedTestnetManifest,
  selectStellarMode,
  STELLAR_TESTNET_NETWORK_PASSPHRASE,
} from "../src/runtime/stellar/index.js";

const manifestPath = resolve(process.cwd(), "../../contracts/soroban/deployments/testnet.json");
const sourcePublicKey = "GB4HSH72SE27IVSQV6O5WDV4UJCYFR5WVZEW2CEF3GWDWF46GPMO5MFU";

async function rawManifest(): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown>;
}

describe("promoted Stellar Testnet manifest", () => {
  it("loads the promoted manifest and exposes only validated public runtime data", async () => {
    const manifest = await loadPromotedTestnetManifest({ path: manifestPath });
    expect(manifest).toMatchObject({
      network: { name: "testnet", passphrase: STELLAR_TESTNET_NETWORK_PASSPHRASE, protocol: 27 },
      sandboxOnly: true,
      schemaVersion: 1,
      status: "promoted",
    });
    expect(Object.keys(manifest.contracts).sort()).toEqual([...contractNames].sort());
    expect(JSON.stringify(manifest)).not.toMatch(/secret_export_command|private_key|seed/i);
  });

  it("rejects missing, malformed, placeholder, secret-bearing, and network-mismatched configuration", async () => {
    await expect(loadPromotedTestnetManifest({ path: `${manifestPath}.missing` })).rejects.toThrow(/file is missing/);
    await expect(loadPromotedTestnetManifest({ path: "ignored", read: async () => "{" })).rejects.toThrow(/malformed JSON/);

    const placeholder = await rawManifest();
    (placeholder.contracts as Record<string, { id: string }>).facility!.id = `C${"A".repeat(55)}`;
    expect(() => parsePromotedTestnetManifest(placeholder)).toThrow(/non-placeholder contract ID/);

    const secret = await rawManifest();
    secret.private_key = "repository-injected-seed";
    expect(() => parsePromotedTestnetManifest(secret)).toThrow(/must not contain signing material/);

    const wrongNetwork = await rawManifest();
    expect(() => parsePromotedTestnetManifest(wrongNetwork, "Public Global Stellar Network ; September 2015")).toThrow(/does not match runtime/);
  });

  it("binds every generated client to the promoted contract and never to request data", async () => {
    const manifest = await loadPromotedTestnetManifest({ path: manifestPath });
    const captured = new Map<string, { contractId: string; networkPassphrase: string; publicKey: string; rpcUrl: string }>();
    const constructor = (name: string) => class {
      constructor(options: { contractId: string; networkPassphrase: string; publicKey: string; rpcUrl: string }) {
        captured.set(name, options);
      }
    };
    createStellarGeneratedClients({
      constructors: {
        assetController: constructor("asset_controller"),
        claimLifecycle: constructor("claim_lifecycle"),
        eligibilityRegistry: constructor("eligibility_registry"),
        facility: constructor("facility"),
        resolutionManager: constructor("resolution_manager"),
        servicingWaterfall: constructor("servicing_waterfall"),
      } as never,
      manifest,
      publicKey: sourcePublicKey,
      rpcUrl: "https://soroban-testnet.stellar.org",
    });
    for (const name of contractNames) {
      expect(captured.get(name)).toEqual({
        contractId: manifest.contracts[name],
        networkPassphrase: manifest.network.passphrase,
        publicKey: sourcePublicKey,
        rpcUrl: "https://soroban-testnet.stellar.org/",
      });
    }
  });
});

describe("explicit Stellar mode and external signing boundary", () => {
  it("never falls back from TESTNET and labels deterministic evidence as rehearsal", () => {
    expect(() => selectStellarMode({ mode: "TESTNET", testnetConfigured: false })).toThrow(/fallback is forbidden/);
    expect(selectStellarMode({ mode: "TESTNET", testnetConfigured: true })).toMatchObject({ evidenceLabel: "STELLAR TESTNET", mode: "TESTNET" });
    expect(selectStellarMode({ mode: "DETERMINISTIC" })).toMatchObject({ evidenceLabel: "DETERMINISTIC REHEARSAL", mode: "DETERMINISTIC" });
  });

  it("rejects inline/request-provided secrets and resolves only an external capability", async () => {
    const resolveCapability = vi.fn();
    const provider = { lookup: vi.fn().mockResolvedValue(null), resolve: resolveCapability };
    expect(() => new ExternalReferenceStellarSubmitter({
      expectedPublicKey: sourcePublicKey,
      provider,
      secretReference: "SREQUEST_INJECTED_SEED",
    })).toThrow(/external env:\/\/ or secret:\/\/ reference/);

    const submit = vi.fn().mockResolvedValue({ ledgerSequence: 123, transactionHash: "a".repeat(64) });
    resolveCapability.mockResolvedValue({ publicKey: sourcePublicKey, submit });
    const boundary = new ExternalReferenceStellarSubmitter({
      expectedPublicKey: sourcePublicKey,
      provider,
      secretReference: "secret://jejak/testnet/transaction-source",
    });
    await expect(boundary.submit({
      network: "TESTNET",
      requestHash: "b".repeat(64),
      submissionId: "submission-1",
      transaction: { publicEnvelope: true },
    })).resolves.toMatchObject({ transactionHash: "a".repeat(64) });
    expect(resolveCapability).toHaveBeenCalledWith("secret://jejak/testnet/transaction-source");
    expect(JSON.stringify(submit.mock.calls)).not.toContain("SREQUEST_INJECTED_SEED");
  });

  it("recovers a lost response by lookup and never blindly resubmits", async () => {
    const receipt = { ledgerSequence: 456, transactionHash: "c".repeat(64) };
    const submit = vi.fn().mockRejectedValue(new Error("response lost after network timeout"));
    const lookup = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(receipt)
      .mockResolvedValue(receipt);
    const boundary = new ExternalReferenceStellarSubmitter({
      expectedPublicKey: sourcePublicKey,
      provider: {
        lookup,
        resolve: vi.fn().mockResolvedValue({ publicKey: sourcePublicKey, submit }),
      },
      secretReference: "env://STELLAR_TESTNET_SIGNER_CAPABILITY",
    });
    const request = { network: "TESTNET" as const, requestHash: "d".repeat(64), submissionId: "submission-lost", transaction: {} };
    await expect(boundary.submit(request)).resolves.toEqual(receipt);
    await expect(boundary.submit(request)).resolves.toEqual(receipt);
    expect(submit).toHaveBeenCalledTimes(1);
    expect(lookup).toHaveBeenCalledTimes(3);
  });

  it("signs the source envelope and every explicit non-invoker authorization", async () => {
    const source = Keypair.random();
    const treasury = Keypair.random();
    const sourceSigner = NodeRoleSigner.fromSecret({
      expectedPublicKey: source.publicKey(),
      networkPassphrase: STELLAR_TESTNET_NETWORK_PASSPHRASE,
      secret: source.secret(),
    });
    const treasurySigner = NodeRoleSigner.fromSecret({
      expectedPublicKey: treasury.publicKey(),
      networkPassphrase: STELLAR_TESTNET_NETWORK_PASSPHRASE,
      secret: treasury.secret(),
    });
    const required = new Set([treasury.publicKey()]);
    const signAuthEntries = vi.fn(async ({ address }: { address: string }) => {
      required.delete(address);
    });
    const signAndSend = vi.fn(async () => ({
      getTransactionResponse: { ledger: 321, status: "SUCCESS" },
      sendTransactionResponse: { hash: "A".repeat(64) },
    }));

    await expect(sourceSigner.submit({
      needsNonInvokerSigningBy: () => [...required],
      signAndSend,
      signAuthEntries,
    }, [treasurySigner])).resolves.toEqual({ ledgerSequence: 321, transactionHash: "a".repeat(64) });
    expect(signAuthEntries).toHaveBeenCalledWith(expect.objectContaining({ address: treasury.publicKey() }));
    expect(signAndSend).toHaveBeenCalledOnce();
  });

  it("fails closed when a required non-invoker signer is missing", async () => {
    const source = Keypair.random();
    const missing = Keypair.random().publicKey();
    const signer = NodeRoleSigner.fromSecret({
      expectedPublicKey: source.publicKey(),
      networkPassphrase: STELLAR_TESTNET_NETWORK_PASSPHRASE,
      secret: source.secret(),
    });
    await expect(signer.submit({
      needsNonInvokerSigningBy: () => [missing],
      signAndSend: vi.fn(),
      signAuthEntries: vi.fn(),
    })).rejects.toThrow(/Missing configured non-invoker/);
  });
});

describe("generated lifecycle and resolution mutation bindings", () => {
  it("binds exact hashes, integers, actors, and states before external submission", async () => {
    const transaction = () => ({ result: { isErr: () => false, unwrapErr: () => ({ message: "unused" }) } });
    const claimLifecycle = {
      confirm_control: vi.fn(async () => transaction()),
      create_claim: vi.fn(async () => transaction()),
      pause: vi.fn(async () => transaction()),
      resume: vi.fn(async () => transaction()),
      transition: vi.fn(async () => transaction()),
    };
    const resolutionManager = {
      close: vi.fn(async () => transaction()),
      get_resolution: vi.fn(async () => ({ result: {
        isErr: () => false,
        unwrap: () => ({
          claim_key: Buffer.from("2".repeat(64), "hex"),
          final_loss: 25n,
          opening_evidence_hash: Buffer.from("3".repeat(64), "hex"),
          reason_code: "SETTLEMENT_SHORTFALL",
          recovered: 100n,
          resolution_hash: undefined,
          resolver: sourcePublicKey,
          status: 1,
        }),
      } })),
      open: vi.fn(async () => transaction()),
      record_recovery: vi.fn(async () => transaction()),
    };
    const submit = vi.fn(async () => ({ transactionHash: "f".repeat(64) }));
    const actions = new GeneratedLifecycleResolutionActions({ claimLifecycle: claimLifecycle as never, resolutionManager: resolutionManager as never, submitter: { submit } });
    const identity = { requestHash: "1".repeat(64), submissionId: "lifecycle-action" };
    const claimKey = "2".repeat(64);
    const hash = "3".repeat(64);

    await actions.createClaim({
      ...identity,
      approvedPrincipalBaseUnits: "64000000",
      attestationKey: "4".repeat(64),
      claimKey,
      facilityId: "5".repeat(64),
      originator: sourcePublicKey,
      sellerSubjectHash: "6".repeat(64),
      sourceAmount: "80000000",
      sourceCurrencyHash: "7".repeat(64),
    });
    await actions.confirmControl({ ...identity, actor: sourcePublicKey, claimKey, evidenceHash: hash, expiresAt: 1_800_000_000n });
    await actions.transition({ ...identity, actor: sourcePublicKey, claimKey, expectedState: 1 as never, nextState: 2 as never, reasonCode: "ISSUER_APPROVED" });
    await actions.pause({ ...identity, claimKey, pauser: sourcePublicKey, reasonCode: "RECONCILIATION_MISMATCH" });
    await actions.openResolution({ ...identity, claimKey, evidenceHash: hash, reasonCode: "SETTLEMENT_SHORTFALL", resolver: sourcePublicKey });
    await actions.recordRecovery({ ...identity, amount: "100", claimKey, evidenceHash: hash, resolver: sourcePublicKey });
    await actions.closeResolution({ ...identity, claimKey, finalLoss: "25", recovered: "100", resolutionHash: hash, resolver: sourcePublicKey });
    await expect(actions.getResolution(claimKey)).resolves.toMatchObject({
      finalLoss: "25",
      openingEvidenceHash: hash,
      recovered: "100",
      status: 1,
    });

    expect(claimLifecycle.create_claim).toHaveBeenCalledWith(expect.objectContaining({
      approved_principal_base_units: 64000000n,
      claim_key: Buffer.from(claimKey, "hex"),
      source_amount: 80000000n,
    }));
    expect(claimLifecycle.confirm_control).toHaveBeenCalledWith(expect.objectContaining({ expires_at: 1_800_000_000n }));
    expect(claimLifecycle.transition).toHaveBeenCalledWith(expect.objectContaining({ expected_state: 1, next_state: 2 }));
    expect(claimLifecycle.pause).toHaveBeenCalledWith(expect.objectContaining({ reason_code: "RECONCILIATION_MISMATCH" }));
    expect(resolutionManager.open).toHaveBeenCalledWith(expect.objectContaining({ evidence_hash: Buffer.from(hash, "hex") }));
    expect(resolutionManager.record_recovery).toHaveBeenCalledWith(expect.objectContaining({ amount: 100n }));
    expect(resolutionManager.close).toHaveBeenCalledWith(expect.objectContaining({ final_loss: 25n, recovered: 100n }));
    expect(submit).toHaveBeenCalledTimes(7);
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ network: "TESTNET", requestHash: identity.requestHash }));
  });
});

describe("safe Stellar references", () => {
  it("builds a public Testnet explorer reference and labels deterministic rehearsal separately", async () => {
    const manifest = await loadPromotedTestnetManifest({ path: manifestPath });
    const testnet = buildSafeStellarTransactionReference({
      action: "EXECUTE_WATERFALL",
      contract: "servicing_waterfall",
      contractId: manifest.contracts.servicing_waterfall,
      ledgerSequence: 123,
      mode: "TESTNET",
      reconciliationState: "RECONCILED",
      transactionHash: "e".repeat(64),
    });
    expect(testnet).toMatchObject({
      explorerUrl: `https://stellar.expert/explorer/testnet/tx/${"e".repeat(64)}`,
      network: "TESTNET",
      status: "RECONCILED",
    });
    expect(testnet).not.toHaveProperty("secret");

    const rehearsal = buildSafeStellarTransactionReference({
      action: "EXECUTE_WATERFALL",
      contract: "servicing_waterfall",
      contractId: manifest.contracts.servicing_waterfall,
      mode: "DETERMINISTIC",
      reconciliationState: "SUBMITTED",
      transactionHash: "e".repeat(64),
    });
    expect(rehearsal.label).toMatch(/deterministic rehearsal/);
    expect(rehearsal).not.toHaveProperty("explorerUrl");
  });
});
