import { describe, expect, it } from "vitest";

import { loadConfig } from "../src/config/env.js";
import { loadEvidenceModuleConfig } from "../src/modules/evidence/config.js";

describe("optional runtime environment", () => {
  it("treats empty optional placeholders as unconfigured without weakening defaults", () => {
    const config = loadConfig({
      DATABASE_DIRECT_URL: "",
      DATABASE_URL: "",
      JEJAK_ALLOW_TEST_PROJECT_MUTATION: "",
      OTEL_ENABLED: "",
      OTEL_EXPORTER_OTLP_ENDPOINT: "",
      SUPABASE_JWKS_URL: "",
      SUPABASE_JWT_ISSUER: "",
      SUPABASE_PUBLISHABLE_KEY: "",
      SUPABASE_SECRET_KEY: "",
      SUPABASE_TEST_PROJECT_REF: "",
      SUPABASE_URL: "",
    });

    expect(config).toMatchObject({
      allowTestProjectMutation: false,
      otelEnabled: false,
      partnerMode: "SANDBOX",
    });
    expect(config).not.toHaveProperty("databaseUrl");
    expect(config).not.toHaveProperty("supabaseSecretKey");
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
