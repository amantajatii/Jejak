import type { AppConfig } from "../src/config/env.js";

export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    appVersion: "test",
    host: "127.0.0.1",
    logLevel: "silent",
    nodeEnv: "test",
    partnerMode: "SANDBOX",
    port: 4000,
    webOrigin: "http://localhost:3000",
    ...overrides,
  };
}
