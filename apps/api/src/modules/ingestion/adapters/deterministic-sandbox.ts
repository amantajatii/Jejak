import { canonicalHash } from "../../shared/hash.js";
import type { CanonicalMarketplaceEvent } from "../domain/types.js";
import type { MarketplaceAdapter, MarketplaceBatch } from "../ports/marketplace-adapter.js";

export type SandboxMarketplaceEvent = Omit<
  CanonicalMarketplaceEvent,
  "sourceRowHash" | "sourceRowNumber"
>;

export function sandboxMarketplaceSourceNamespace(marketplaceConnectionId: string): string {
  return `JEJAK_SANDBOX_MARKETPLACE_V1:${marketplaceConnectionId}`;
}

export class DeterministicSandboxMarketplaceAdapter implements MarketplaceAdapter {
  readonly mode = "SANDBOX" as const;

  constructor(
    private readonly fixtures: Readonly<Record<string, readonly SandboxMarketplaceEvent[]>>,
    private readonly sourceNamespace = "JEJAK_SANDBOX_MARKETPLACE_V1",
  ) {}

  async fetch(input: { marketplaceConnectionId: string }): Promise<MarketplaceBatch> {
    const fixture = this.fixtures[input.marketplaceConnectionId] ?? [];
    const sourceNamespace =
      this.sourceNamespace === "JEJAK_SANDBOX_MARKETPLACE_V1"
        ? sandboxMarketplaceSourceNamespace(input.marketplaceConnectionId)
        : `${this.sourceNamespace}:${input.marketplaceConnectionId}`;
    const events = fixture.map((event, index) => ({
      ...event,
      sourceRowHash: canonicalHash(event),
      sourceRowNumber: index + 1,
    }));
    const report = {
      format: "JEJAK_MARKETPLACE_BATCH_V1" as const,
      totalRows: events.length,
      validUniqueRows: events.length,
      duplicateRows: 0,
      rejectedRows: 0,
      qualityScoreBps: events.length === 0 ? 0 : 10_000,
      issues:
        events.length === 0
          ? [
              {
                blocksAutomation: true,
                code: "MISSING_PAYOUT_HISTORY" as const,
                detail: "No marketplace event rows were supplied.",
                severity: "BLOCKING" as const,
              },
            ]
          : [],
    };
    return {
      batchHash: canonicalHash({
        events,
        marketplaceConnectionId: input.marketplaceConnectionId,
        sourceNamespace,
      }),
      events,
      report,
      sourceNamespace,
    };
  }
}
