import { afterEach, describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import { testConfig } from "./helpers.js";

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("canonical API errors", () => {
  it("returns NOT_FOUND without leaking internal details", async () => {
    const app = await buildApp({ config: testConfig(), logger: false, readinessProbes: [] });
    apps.push(app);

    const response = await app.inject({ method: "GET", url: "/missing" });
    const body = response.json();

    expect(response.statusCode).toBe(404);
    expect(body.error).toEqual({
      code: "NOT_FOUND",
      message: "The requested resource was not found.",
      requestId: expect.any(String),
      retryable: false,
    });
  });

  it("maps unexpected exceptions to INTERNAL_ERROR", async () => {
    const app = await buildApp({ config: testConfig(), logger: false, readinessProbes: [] });
    app.get("/__test/error", async () => {
      throw new Error("sensitive internal detail");
    });
    apps.push(app);

    const response = await app.inject({ method: "GET", url: "/__test/error" });
    const body = response.json();

    expect(response.statusCode).toBe(500);
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(response.body).not.toContain("sensitive internal detail");
  });
});
