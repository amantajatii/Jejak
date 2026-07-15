import { afterEach, describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import { testConfig } from "./helpers.js";

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("GET /ready", () => {
  it("returns ready when every required dependency is healthy", async () => {
    const app = await buildApp({
      config: testConfig(),
      logger: false,
      readinessProbes: [
        { name: "database", required: true, async check() { return { status: "healthy" }; } },
        {
          name: "risk_service",
          required: false,
          async check() { return { status: "not_configured" }; },
        },
      ],
    });
    apps.push(app);

    const response = await app.inject({ method: "GET", url: "/ready" });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.data.status).toBe("ready");
    expect(body.data.dependencies).toEqual([
      expect.objectContaining({ name: "database", required: true, status: "healthy" }),
      expect.objectContaining({
        name: "risk_service",
        required: false,
        status: "not_configured",
      }),
    ]);
  });

  it("returns 503 when a required dependency is not configured", async () => {
    const app = await buildApp({ config: testConfig(), logger: false });
    apps.push(app);

    const response = await app.inject({ method: "GET", url: "/ready" });
    const body = response.json();

    expect(response.statusCode).toBe(503);
    expect(body.data.status).toBe("not_ready");
    expect(body.data.dependencies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "supabase_postgres",
          required: true,
          status: "not_configured",
        }),
      ]),
    );
  });
});
