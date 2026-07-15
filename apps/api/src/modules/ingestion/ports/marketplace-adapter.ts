import type { CanonicalMarketplaceEvent, IngestionQualityReport } from "../domain/types.js";

export type MarketplaceBatch = {
  batchHash: string;
  events: CanonicalMarketplaceEvent[];
  report: IngestionQualityReport;
  sourceNamespace: string;
};

export type MarketplaceAdapter = {
  readonly mode: "SANDBOX" | "PRODUCTION";
  fetch(input: { marketplaceConnectionId: string }): Promise<MarketplaceBatch>;
};
