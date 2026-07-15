import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../..");

describe("P1-10 runtime composition", () => {
  it("defines database, migration, API, RISK, and worker services with readiness gates", async () => {
    const compose = await readFile(resolve(root, "docker-compose.yml"), "utf8");
    for (const service of ["postgres", "migrate", "risk", "api", "risk-worker"]) {
      expect(compose).toContain(`  ${service}:`);
    }
    expect(compose).toContain("condition: service_healthy");
    expect(compose).toContain("condition: service_completed_successfully");
    expect(compose).toContain("fetch('http://127.0.0.1:4000/ready')");
    expect(compose).toContain("WEB_ORIGIN: ${WEB_ORIGIN:-http://localhost:3000}");
  });

  it("contains references and interpolation, not embedded signing or database secrets", async () => {
    const compose = await readFile(resolve(root, "docker-compose.yml"), "utf8");
    expect(compose).toContain("STELLAR_SIGNER_SECRET_REF: ${STELLAR_SIGNER_SECRET_REF:-}");
    expect(compose).toContain("JCC_SIGNER_TOKEN_REF: ${JCC_SIGNER_TOKEN_REF:-}");
    expect(compose).not.toMatch(/S[A-Z2-7]{55}/);
    expect(compose).not.toMatch(/postgres(?:ql)?:\/\/[^$\s]+:[^$\s]+@/);
  });
});
