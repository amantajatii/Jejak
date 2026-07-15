import { describe, expect, it } from "vitest";

import {
  buildDemoSeedPlan,
  DemoResetService,
  deterministicUuidV7,
  InMemoryDemoResetRepository,
} from "../src/modules/demo/index.js";

const now = new Date("2026-07-15T12:00:00.000Z");

describe("demo reset application", () => {
  it("builds deterministic HAPPY prerequisites through canonical domain builders", () => {
    const first = buildDemoSeedPlan({ idempotencyKey: "demo-reset-key-0001", now: now.toISOString(), scenario: "HAPPY" });
    const replay = buildDemoSeedPlan({ idempotencyKey: "demo-reset-key-0001", now: now.toISOString(), scenario: "HAPPY" });
    expect(replay).toEqual(first);
    expect(first.context).toMatchObject({ chainMode: "DETERMINISTIC", claimState: "DRAFT", scenario: "HAPPY", version: 1 });
    expect(first.context.actors.map((actor) => actor.role)).toEqual([
      "SELLER", "ORIGINATOR", "ISSUER", "FACILITY", "SERVICER", "RESOLVER", "SYSTEM",
    ]);
    expect(first.snapshot.blocksAutomation).toBe(false);
    expect(first.snapshot.dataSnapshotHash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.claim).not.toHaveProperty("seedCheckpoint");
  });

  it("marks ADVERSE as a seed-originated reconciled FUNDED checkpoint without chain hashes", () => {
    const plan = buildDemoSeedPlan({ idempotencyKey: "demo-reset-key-0002", now: now.toISOString(), scenario: "ADVERSE" });
    expect(plan.context).toMatchObject({ claimState: "FUNDED", scenario: "ADVERSE", version: 5 });
    expect(plan.claim).toMatchObject({
      seedCheckpoint: { kind: "DEMO_RECONCILED_FUNDING_CHECKPOINT_V1", reconciled: true, source: "DEMO_RESET" },
      state: "FUNDED",
    });
    expect(JSON.stringify(plan)).not.toMatch(/transactionHash|jcc|signature|CLOSED_WITH_LOSS|"CLOSED"/i);
  });

  it("replays identical reset, rejects a conflicting scenario, and isolates keys by tenant", async () => {
    const repository = new InMemoryDemoResetRepository();
    const service = new DemoResetService(repository, { now: () => now });
    const first = await service.reset({ idempotencyKey: "demo-reset-key-0003", requestId: deterministicUuidV7("request-1"), scenario: "HAPPY" });
    const replay = await service.reset({ idempotencyKey: "demo-reset-key-0003", requestId: deterministicUuidV7("request-2"), scenario: "HAPPY" });
    expect(replay).toEqual(first);
    await expect(service.reset({ idempotencyKey: "demo-reset-key-0003", requestId: deterministicUuidV7("request-3"), scenario: "ADVERSE" }))
      .rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    const isolated = await service.reset({ idempotencyKey: "demo-reset-key-0004", requestId: deterministicUuidV7("request-4"), scenario: "HAPPY" });
    expect(isolated.tenantId).not.toBe(first.tenantId);
    await expect(service.getContext(deterministicUuidV7("unknown-tenant"))).rejects.toMatchObject({ code: "DEMO_CONTEXT_NOT_FOUND" });
    await expect(service.getContext(first.tenantId)).resolves.toEqual(first);
    expect(repository.audit).toEqual([expect.objectContaining({ action: "demo.prerequisites.seeded", provenance: "DEMO_RESET" }), expect.anything()]);
  });
});
