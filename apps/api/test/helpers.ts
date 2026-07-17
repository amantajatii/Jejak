import type { AppConfig } from "../src/config/env.js";

export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    appVersion: "test",
    allowTestProjectMutation: false,
    host: "127.0.0.1",
    jccTtlMs: 86_400_000,
    logLevel: "silent",
    nodeEnv: "test",
    otelEnabled: false,
    otelServiceName: "jejak-api-test",
    partnerMode: "SANDBOX",
    port: 4000,
    webOrigin: "http://localhost:3000",
    ...overrides,
  };
}
