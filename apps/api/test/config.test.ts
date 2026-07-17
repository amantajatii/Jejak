import { describe, expect, it } from "vitest";

import { loadConfig } from "../src/config/env.js";
import { loadEvidenceModuleConfig } from "../src/modules/evidence/config.js";

describe("optional runtime environment", () => {
  it("treats empty optional placeholders as unconfigured without weakening defaults", () => {
    const config = loadConfig({
      DATABASE_DIRECT_URL: "",
      DATABASE_URL: "",
      DEMO_JWT_SIGNING_KEY_REF: "",
      DEMO_MODE: "",
      JEJAK_CHAIN_MODE: "",
      JEJAK_FACILITY_OPERATOR_SECRET_REF: "",
      JEJAK_ISSUER_OPERATOR_SECRET_REF: "",
      JEJAK_ORIGINATOR_CONTROL_SECRET_REF: "",
      JEJAK_RESOLVER_SECRET_REF: "",
      JEJAK_SERVICER_SECRET_REF: "",
      JEJAK_TREASURY_HOLDER_SECRET_REF: "",
      JCC_SIGNER_TOKEN_REF: "",
      JEJAK_ALLOW_TEST_PROJECT_MUTATION: "",
      OTEL_ENABLED: "",
      OTEL_EXPORTER_OTLP_ENDPOINT: "",
      SUPABASE_JWKS_URL: "",
      SUPABASE_JWT_ISSUER: "",
      SUPABASE_PUBLISHABLE_KEY: "",
      SUPABASE_SECRET_KEY: "",
      SUPABASE_TEST_PROJECT_REF: "",
      SUPABASE_URL: "",
      STELLAR_SIGNER_SECRET_REF: "",
    });

    expect(config).toMatchObject({
      allowTestProjectMutation: false,
      demoJwtAudience: "jejak-demo",
      demoJwtIssuer: "https://demo.jejak.local",
      demoJwtTtlSeconds: 300,
      demoMode: false,
      otelEnabled: false,
      partnerMode: "SANDBOX",
      testnetFirstLossBaseUnits: "100000000",
    });
    expect(config).not.toHaveProperty("databaseUrl");
    expect(config).not.toHaveProperty("chainMode");
    expect(config).not.toHaveProperty("supabaseSecretKey");
  });

  it("rejects inline secret material and incomplete Testnet configuration", () => {
    expect(() => loadConfig({ JCC_SIGNER_TOKEN_REF: "inline-secret" }))
      .toThrow(/external reference|env:\/\/|secret:\/\//i);
    expect(() => loadConfig({ JEJAK_CHAIN_MODE: "TESTNET" }))
      .toThrow(/STELLAR_TESTNET_MANIFEST_PATH/i);
  });

  it("accepts a complete Testnet configuration containing references but no resolved secrets", () => {
    expect(loadConfig({
      JEJAK_CHAIN_MODE: "TESTNET",
      STELLAR_NETWORK_PASSPHRASE: "Test SDF Network ; September 2015",
      STELLAR_RPC_URL: "https://rpc.testnet.example",
      STELLAR_SIGNER_SECRET_REF: "env://STELLAR_SIGNING_CAPABILITY",
      STELLAR_SOURCE_PUBLIC_KEY: `G${"A".repeat(55)}`,
      STELLAR_TESTNET_MANIFEST_PATH: "contracts/soroban/deployments/testnet.json",
    })).toMatchObject({
      chainMode: "TESTNET",
      stellarSignerSecretReference: "env://STELLAR_SIGNING_CAPABILITY",
      stellarTestnetManifestPath: "contracts/soroban/deployments/testnet.json",
    });
  });

  it("parses role-specific Testnet signer references without resolving secret material", () => {
    const config = loadConfig({
      JEJAK_FACILITY_OPERATOR_SECRET_REF: "env://JEJAK_FACILITY_OPERATOR_SECRET",
      JEJAK_ISSUER_OPERATOR_SECRET_REF: "secret://jejak/testnet/issuer-operator",
      JEJAK_ORIGINATOR_CONTROL_SECRET_REF: "env://JEJAK_ORIGINATOR_CONTROL_SECRET",
      JEJAK_RESOLVER_SECRET_REF: "env://JEJAK_RESOLVER_SECRET",
      JEJAK_SERVICER_SECRET_REF: "env://JEJAK_SERVICER_SECRET",
      JEJAK_TESTNET_FIRST_LOSS_BASE_UNITS: "25000000",
      JEJAK_TREASURY_HOLDER_SECRET_REF: "env://JEJAK_TREASURY_HOLDER_SECRET",
    });
    expect(config).toMatchObject({
      facilityOperatorSecretReference: "env://JEJAK_FACILITY_OPERATOR_SECRET",
      issuerOperatorSecretReference: "secret://jejak/testnet/issuer-operator",
      originatorControlSecretReference: "env://JEJAK_ORIGINATOR_CONTROL_SECRET",
      resolverSecretReference: "env://JEJAK_RESOLVER_SECRET",
      servicerSecretReference: "env://JEJAK_SERVICER_SECRET",
      testnetFirstLossBaseUnits: "25000000",
      treasuryHolderSecretReference: "env://JEJAK_TREASURY_HOLDER_SECRET",
    });
  });

  it("fails closed when demo identity is combined with production partners", () => {
    expect(() => loadConfig({
      DEMO_JWT_SIGNING_KEY_REF: "secret://jejak/demo-signing-key",
      DEMO_MODE: "true",
      PARTNER_MODE: "PRODUCTION",
    })).toThrow(/DEMO_MODE.*PRODUCTION/i);
  });

  it("requires an external signing-key reference when demo identity is enabled", () => {
    expect(() => loadConfig({ DEMO_MODE: "true", PARTNER_MODE: "SANDBOX" }))
      .toThrow(/DEMO_JWT_SIGNING_KEY_REF/i);
    expect(loadConfig({
      DEMO_JWT_AUDIENCE: "jejak-browser-demo",
      DEMO_JWT_ISSUER: "https://issuer.demo.jejak.local",
      DEMO_JWT_SIGNING_KEY_REF: "secret://jejak/demo-signing-key",
      DEMO_JWT_TTL_SECONDS: "120",
      DEMO_MODE: "true",
      PARTNER_MODE: "SANDBOX",
    })).toMatchObject({
      demoJwtAudience: "jejak-browser-demo",
      demoJwtIssuer: "https://issuer.demo.jejak.local",
      demoJwtSigningKeyRef: "secret://jejak/demo-signing-key",
      demoJwtTtlSeconds: 120,
      demoMode: true,
      partnerMode: "SANDBOX",
    });
  });

  it("keeps production evidence-storage requirements strict after blank normalization", () => {
    expect(() => loadEvidenceModuleConfig({
      EVIDENCE_INTENT_SIGNING_KEY: "",
      EVIDENCE_STORAGE_MODE: "",
      NODE_ENV: "production",
      SUPABASE_SECRET_KEY: "",
      SUPABASE_URL: "",
    })).toThrow(/SIGNING_KEY|Supabase/i);
  });
});
