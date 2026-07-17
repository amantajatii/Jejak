import { randomBytes } from "node:crypto";

import { Keypair, StrKey } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";

import { contractNames } from "../src/modules/chain/domain/events.js";
import { buildTestnetActionRuntime } from "../src/runtime/testnet-action-runtime.js";
import { STELLAR_TESTNET_NETWORK_PASSPHRASE, type PromotedTestnetManifest } from "../src/runtime/stellar/index.js";
import { testConfig } from "./helpers.js";

function fixture() {
  const roles = Object.fromEntries([
    "jclaim_issuer", "jusd_issuer", "oracle", "originator_control", "issuer_operator", "facility_operator",
    "treasury_holder", "servicer", "resolver", "pauser", "seller_payout",
  ].map((role) => [role, Keypair.random()])) as Record<string, Keypair>;
  const contract = () => StrKey.encodeContract(randomBytes(32));
  const manifest: PromotedTestnetManifest = {
    assets: {
      JCLAIM: { issuer: roles.jclaim_issuer!.publicKey(), sacId: contract(), scale: 7 },
      JUSD: { issuer: roles.jusd_issuer!.publicKey(), sacId: contract(), scale: 7 },
    },
    configuration: { facilityId: randomBytes(32).toString("hex") },
    contracts: Object.fromEntries(contractNames.map((name) => [name, contract()])) as PromotedTestnetManifest["contracts"],
    network: { name: "testnet", passphrase: STELLAR_TESTNET_NETWORK_PASSPHRASE, protocol: 27 },
    roles: Object.fromEntries(Object.entries(roles).map(([role, pair]) => [role, pair.publicKey()])) as PromotedTestnetManifest["roles"],
    sandboxOnly: true,
    schemaVersion: 1,
    status: "promoted",
  };
  const references = {
    facilityOperatorSecretReference: "env://FACILITY",
    issuerOperatorSecretReference: "env://ISSUER",
    originatorControlSecretReference: "env://ORIGINATOR",
    resolverSecretReference: "env://RESOLVER",
    servicerSecretReference: "env://SERVICER",
    treasuryHolderSecretReference: "env://TREASURY",
  } as const;
  const secrets = new Map<string, string>([
    [references.facilityOperatorSecretReference, roles.facility_operator!.secret()],
    [references.issuerOperatorSecretReference, roles.issuer_operator!.secret()],
    [references.originatorControlSecretReference, roles.originator_control!.secret()],
    [references.resolverSecretReference, roles.resolver!.secret()],
    [references.servicerSecretReference, roles.servicer!.secret()],
    [references.treasuryHolderSecretReference, roles.treasury_holder!.secret()],
  ]);
  return { manifest, references, roles, secrets };
}

describe("signed Testnet action runtime", () => {
  it("stays unregistered when any required role reference is absent", async () => {
    const { manifest, references, secrets } = fixture();
    const { resolverSecretReference: _missing, ...incomplete } = references;
    const runtime = await buildTestnetActionRuntime({
      config: testConfig({
        chainMode: "TESTNET",
        ...incomplete,
        stellarRpcUrl: "https://rpc.example.test",
        stellarSourcePublicKey: manifest.roles.oracle,
      }),
      database: {} as never,
      manifest,
      secretReferences: { resolve: async (reference) => secrets.get(reference) },
      verifier: { verify: async () => ({ subject: "test" }) },
    });
    expect(runtime).toBeUndefined();
  });

  it("binds every HTTP action signer to its promoted manifest role", async () => {
    const { manifest, references, roles, secrets } = fixture();
    const runtime = await buildTestnetActionRuntime({
      config: testConfig({
        chainMode: "TESTNET",
        ...references,
        stellarRpcUrl: "https://rpc.example.test",
        stellarSourcePublicKey: manifest.roles.oracle,
      }),
      database: {} as never,
      manifest,
      secretReferences: { resolve: async (reference) => secrets.get(reference) },
      verifier: { verify: async () => ({ subject: "test" }) },
    });
    expect(runtime?.signers).toMatchObject({
      facilityOperator: { publicKey: roles.facility_operator!.publicKey() },
      issuerOperator: { publicKey: roles.issuer_operator!.publicKey() },
      originatorControl: { publicKey: roles.originator_control!.publicKey() },
      resolver: { publicKey: roles.resolver!.publicKey() },
      servicer: { publicKey: roles.servicer!.publicKey() },
      treasuryHolder: { publicKey: roles.treasury_holder!.publicKey() },
    });
    expect(runtime?.issuerIssueDependencies).toBeDefined();
    expect(runtime?.facilityFundingDependencies).toBeDefined();
    expect(runtime?.settlementDependencies).toBeDefined();
    expect(runtime?.resolutionDependencies).toBeDefined();
  });
});
