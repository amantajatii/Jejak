import { describe, expect, it } from "vitest";

import { loadConfig } from "../src/config/env.js";

describe("RISK service configuration", () => {
  it("accepts the internal URL and optional workload token", () => {
    const config = loadConfig({
      RISK_SERVICE_URL: "http://localhost:8001",
      RISK_SERVICE_TOKEN: "sandbox-token",
    });

    expect(config.riskServiceUrl).toBe("http://localhost:8001");
    expect(config.riskServiceToken).toBe("sandbox-token");
  });

  it("does not configure a RISK client URL by default", () => {
    expect(loadConfig({}).riskServiceUrl).toBeUndefined();
  });

  it("normalizes blank optional infrastructure settings", () => {
    const config = loadConfig({ DATABASE_URL: "  ", RISK_SERVICE_URL: "", SUPABASE_URL: "" });
    expect(config.databaseUrl).toBeUndefined();
    expect(config.riskServiceUrl).toBeUndefined();
    expect(config.supabaseUrl).toBeUndefined();
  });
});
