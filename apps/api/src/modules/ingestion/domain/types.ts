import type { MoneyValue } from "../../shared/money.js";

export const marketplaceEventTypes = [
  "ORDER_SETTLED",
  "PAYOUT",
  "REFUND",
  "RETURN",
  "CHARGEBACK",
  "FEE",
  "ADJUSTMENT",
] as const;

export type MarketplaceEventType = (typeof marketplaceEventTypes)[number];

export type CanonicalMarketplaceEvent = {
  externalEventId: string;
  eventType: MarketplaceEventType;
  occurredAt: string;
  amount: MoneyValue;
  orderReference?: string;
  payoutReference?: string;
  sourceStatus?: string;
  sourceRowHash: string;
  sourceRowNumber: number;
};

export type DataQualityIssue = {
  code: "DATA_INCONSISTENT" | "MISSING_PAYOUT_HISTORY";
  severity: "WARNING" | "BLOCKING";
  blocksAutomation: boolean;
  rowNumber?: number;
  field?: string;
  detail: string;
};

export type IngestionQualityReport = {
  format: "JEJAK_CANONICAL_CSV_V1" | "JEJAK_MARKETPLACE_BATCH_V1";
  totalRows: number;
  validUniqueRows: number;
  duplicateRows: number;
  rejectedRows: number;
  qualityScoreBps: number;
  issues: DataQualityIssue[];
};

export type ParsedIngestion = {
  events: CanonicalMarketplaceEvent[];
  report: IngestionQualityReport;
};
