import { describe, expect, it } from "vitest";

import {
  DeterministicSandboxPayoutControlResolver,
  UnconfiguredPayoutControlResolver,
} from "../src/runtime/payout-control-resolver.js";

describe("runtime payout-control resolver", () => {
  it("uses a deterministic sandbox-only identity and fails closed when production is unconfigured", async () => {
    const sandbox = new DeterministicSandboxPayoutControlResolver();
    await expect(sandbox.resolve({ claimId: "claim", tenantId: "tenant" })).resolves.toBe("sandbox-payout:tenant:claim");
    await expect(new UnconfiguredPayoutControlResolver().resolve({ claimId: "claim", tenantId: "tenant" }))
      .rejects.toMatchObject({ code: "PARTNER_REJECTED", retryable: false });
  });
});
