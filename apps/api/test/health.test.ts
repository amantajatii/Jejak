import { afterEach, describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import { testConfig } from "./helpers.js";

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("GET /health", () => {
  it("returns the canonical sandbox success envelope without probing dependencies", async () => {
    const app = await buildApp({
      config: testConfig(),
      logger: false,
      readinessProbes: [
        {
          name: "must_not_run",
          required: true,
          async check() {
            throw new Error("health endpoint called a readiness probe");
          },
        },
      ],
    });
    apps.push(app);

    const response = await app.inject({ method: "GET", url: "/health" });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.data).toEqual({ service: "api", status: "ok", version: "test" });
    expect(body.meta.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(body.meta.sandbox).toBe(true);
    expect(new Date(body.meta.timestamp).toISOString()).toBe(body.meta.timestamp);
  });
});
