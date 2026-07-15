import { describe, expect, it, vi } from "vitest";

import {
  EnvironmentSellerSubjectHasher,
  RiskWorkerRuntime,
} from "../src/modules/risk/index.js";

const tenantId = "0198a5ea-7c9c-7000-8000-000000000001";

describe("executable RISK worker runtime", () => {
  it("processes a bounded batch independently and continues after one durable failure", async () => {
    const run = vi.fn()
      .mockResolvedValueOnce({ status: "SUCCEEDED" })
      .mockRejectedValueOnce(new Error("durably classified"))
      .mockResolvedValueOnce({ status: "COMPLETED" });
    const queue = { listCandidates: vi.fn().mockResolvedValue(["operation-1", "operation-2", "operation-3"]) };
    const runtime = new RiskWorkerRuntime({
      queue,
      workerFor: () => ({ run }) as never,
    }, { batchSize: 3, now: () => new Date("2026-07-15T12:00:00.000Z") });

    await expect(runtime.runOnce(tenantId)).resolves.toEqual({ attempted: 3, failed: 1, succeeded: 2 });
    expect(queue.listCandidates).toHaveBeenCalledWith({
      limit: 3,
      staleBefore: new Date("2026-07-15T11:59:00.000Z"),
      tenantId,
    });
  });

  it("hashes seller subjects with a secret reference and tenant binding", async () => {
    const source = { RISK_SUBJECT_SALT: "a-secret-value-with-at-least-32-bytes" };
    const hasher = new EnvironmentSellerSubjectHasher("env://RISK_SUBJECT_SALT", source);
    const base = { sellerId: "seller-1", sellerSubject: "private-seller", tenantId };
    const first = await hasher.hashSellerSubject(base);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    await expect(hasher.hashSellerSubject({ ...base, tenantId: `${tenantId}-other` })).resolves.not.toBe(first);
    expect(() => new EnvironmentSellerSubjectHasher("inline-secret", source)).toThrow("env://");
    expect(JSON.stringify(hasher)).not.toContain(source.RISK_SUBJECT_SALT);
  });
});
