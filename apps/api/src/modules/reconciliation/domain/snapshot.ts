import type { CanonicalMarketplaceEvent, IngestionQualityReport } from "../../ingestion/domain/types.js";
import { canonicalHash } from "../../shared/hash.js";
import {
  addMoney,
  assertSameMoneyUnit,
  moneyAmount,
  type MoneyValue,
  withMoneyAmount,
  zeroMoney,
} from "../../shared/money.js";
import { validationError } from "../../shared/errors.js";

export type ReconciliationBaseline = {
  grossUnsettled: MoneyValue;
  knownAdjustments: MoneyValue;
  realizedToDate: MoneyValue;
  orderCount: number;
  firstEventAt?: string;
  lastEventAt?: string;
};

export type DecisionSnapshot = {
  id: string;
  tenantId: string;
  sellerId: string;
  marketplaceConnectionId: string;
  sourceCurrency: string;
  snapshotCutoffAt: string;
  dataSnapshotHash: string;
  grossUnsettled: MoneyValue;
  knownAdjustments: MoneyValue;
  realizedToDate: MoneyValue;
  orderCount: number;
  firstEventAt: string;
  lastEventAt: string;
  dataQualityScoreBps: number;
  includedEventHashes: string[];
  ledgerHighWaterMark?: string;
  qualityReportHash: string;
  snapshotSchemaVersion: "JEJAK_SETTLEMENT_SNAPSHOT_V1";
  featureSchemaVersion: string;
  predecessorSnapshotId?: string;
  createdAt: string;
  version: number;
};

function compareEvents(left: CanonicalMarketplaceEvent, right: CanonicalMarketplaceEvent): number {
  return (
    new Date(left.occurredAt).valueOf() - new Date(right.occurredAt).valueOf() ||
    left.externalEventId.localeCompare(right.externalEventId) ||
    left.sourceRowHash.localeCompare(right.sourceRowHash)
  );
}

function absoluteMoney(value: MoneyValue): MoneyValue {
  const amount = moneyAmount(value);
  return withMoneyAmount(value, amount < 0n ? -amount : amount);
}

export function buildDecisionSnapshot(input: {
  id: string;
  tenantId: string;
  sellerId: string;
  marketplaceConnectionId: string;
  cutoffAt: string;
  createdAt: string;
  events: CanonicalMarketplaceEvent[];
  qualityReport: IngestionQualityReport;
  moneyUnit: MoneyValue;
  baseline?: ReconciliationBaseline;
  predecessorSnapshotId?: string;
  version?: number;
  featureSchemaVersion?: string;
}): DecisionSnapshot {
  const cutoff = new Date(input.cutoffAt);
  if (Number.isNaN(cutoff.valueOf()) || !input.cutoffAt.endsWith("Z")) {
    validationError("Snapshot cutoff must be a UTC RFC 3339 timestamp.");
  }
  const unitZero = zeroMoney(input.moneyUnit);
  const baseline = input.baseline ?? {
    grossUnsettled: unitZero,
    knownAdjustments: unitZero,
    realizedToDate: unitZero,
    orderCount: 0,
  };
  assertSameMoneyUnit(input.moneyUnit, baseline.grossUnsettled);
  assertSameMoneyUnit(input.moneyUnit, baseline.knownAdjustments);
  assertSameMoneyUnit(input.moneyUnit, baseline.realizedToDate);

  const events = input.events
    .filter((event) => new Date(event.occurredAt).valueOf() <= cutoff.valueOf())
    .slice()
    .sort(compareEvents);
  let grossUnsettled = baseline.grossUnsettled;
  let knownAdjustments = baseline.knownAdjustments;
  let realizedToDate = baseline.realizedToDate;
  let orderCount = baseline.orderCount;

  for (const event of events) {
    assertSameMoneyUnit(input.moneyUnit, event.amount);
    if (event.eventType === "ORDER_SETTLED") {
      grossUnsettled = addMoney(grossUnsettled, event.amount);
      orderCount += 1;
    } else if (event.eventType === "PAYOUT") {
      realizedToDate = addMoney(realizedToDate, absoluteMoney(event.amount));
    } else {
      knownAdjustments = addMoney(
        knownAdjustments,
        event.eventType === "ADJUSTMENT" ? event.amount : absoluteMoney(event.amount),
      );
    }
  }

  const firstEventAt = baseline.firstEventAt ?? events[0]?.occurredAt ?? input.cutoffAt;
  const lastEventAt = events.at(-1)?.occurredAt ?? baseline.lastEventAt ?? input.cutoffAt;
  const includedEventHashes = events.map((event) => event.sourceRowHash);
  const qualityReportHash = canonicalHash({
    format: input.qualityReport.format,
    totalRows: input.qualityReport.totalRows,
    validUniqueRows: input.qualityReport.validUniqueRows,
    duplicateRows: input.qualityReport.duplicateRows,
    rejectedRows: input.qualityReport.rejectedRows,
    qualityScoreBps: input.qualityReport.qualityScoreBps,
    issues: input.qualityReport.issues.map((issue) => ({
      code: issue.code,
      severity: issue.severity,
      blocksAutomation: issue.blocksAutomation,
      ...(issue.rowNumber === undefined ? {} : { rowNumber: issue.rowNumber }),
      ...(issue.field === undefined ? {} : { field: issue.field }),
      detail: issue.detail,
    })),
  });
  const hashInput = {
    schema: "JEJAK_SETTLEMENT_SNAPSHOT_V1",
    tenantId: input.tenantId,
    sellerId: input.sellerId,
    marketplaceConnectionId: input.marketplaceConnectionId,
    snapshotCutoffAt: input.cutoffAt,
    grossUnsettled,
    knownAdjustments,
    realizedToDate,
    orderCount,
    firstEventAt,
    lastEventAt,
    dataQualityScoreBps: input.qualityReport.qualityScoreBps,
    qualityReportHash,
    includedEventHashes,
    featureSchemaVersion: input.featureSchemaVersion ?? "JEJAK_RISK_FEATURES_V1",
    ...(input.predecessorSnapshotId === undefined
      ? {}
      : { predecessorSnapshotId: input.predecessorSnapshotId }),
  };
  const lastIncludedEvent = events.at(-1);

  return {
    id: input.id,
    tenantId: input.tenantId,
    sellerId: input.sellerId,
    marketplaceConnectionId: input.marketplaceConnectionId,
    sourceCurrency: input.moneyUnit.currency,
    snapshotCutoffAt: input.cutoffAt,
    dataSnapshotHash: canonicalHash(hashInput),
    grossUnsettled,
    knownAdjustments,
    realizedToDate,
    orderCount,
    firstEventAt,
    lastEventAt,
    dataQualityScoreBps: input.qualityReport.qualityScoreBps,
    includedEventHashes,
    ...(lastIncludedEvent === undefined
      ? {}
      : { ledgerHighWaterMark: lastIncludedEvent.externalEventId }),
    qualityReportHash,
    snapshotSchemaVersion: "JEJAK_SETTLEMENT_SNAPSHOT_V1",
    featureSchemaVersion: input.featureSchemaVersion ?? "JEJAK_RISK_FEATURES_V1",
    ...(input.predecessorSnapshotId === undefined
      ? {}
      : { predecessorSnapshotId: input.predecessorSnapshotId }),
    createdAt: input.createdAt,
    version: input.version ?? 1,
  };
}

export type DecisionSnapshotRepository = {
  insert(snapshot: DecisionSnapshot): Promise<void>;
  findById(tenantId: string, snapshotId: string): Promise<DecisionSnapshot | null>;
};
