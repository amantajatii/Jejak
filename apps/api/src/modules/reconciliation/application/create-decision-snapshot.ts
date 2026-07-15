import type { TransactionActorContext } from "../../../db/context.js";
import type {
  CanonicalMarketplaceEvent,
  IngestionQualityReport,
} from "../../ingestion/domain/types.js";
import { DomainError } from "../../shared/errors.js";
import { assertSameMoneyUnit, type MoneyValue } from "../../shared/money.js";
import {
  buildDecisionSnapshot,
  type DecisionSnapshot,
  type DecisionSnapshotRepository,
} from "../domain/snapshot.js";

export type DecisionInputRepository = DecisionSnapshotRepository & {
  hasMarketplaceConnection(input: {
    marketplaceConnectionId: string;
    sellerId: string;
    tenantId: string;
  }): Promise<boolean>;
  findByHash(tenantId: string, dataSnapshotHash: string): Promise<DecisionSnapshot | null>;
  insertOrFind(snapshot: DecisionSnapshot): Promise<DecisionSnapshot>;
  loadEvents(input: {
    cutoffAt: string;
    ingestionId: string;
    sellerId: string;
    sourceNamespace: string;
    tenantId: string;
  }): Promise<CanonicalMarketplaceEvent[]>;
  loadQualityReport(input: {
    ingestionId: string;
    sellerId: string;
    sourceNamespace: string;
    tenantId: string;
  }): Promise<IngestionQualityReport | null>;
};

export type DecisionSnapshotUnitOfWork = {
  transaction<T>(work: (repository: DecisionInputRepository) => Promise<T>): Promise<T>;
};

export class DecisionSnapshotApplication {
  constructor(
    private readonly context: TransactionActorContext,
    private readonly unitOfWork: DecisionSnapshotUnitOfWork,
    private readonly options: {
      featureSchemaVersion?: string;
      nextId: () => string;
      now: () => Date;
    },
  ) {}

  create(input: {
    cutoffAt: string;
    ingestionId: string;
    marketplaceConnectionId: string;
    moneyUnit: MoneyValue;
    predecessorSnapshotId?: string;
    sellerId: string;
    sourceNamespace: string;
  }): Promise<DecisionSnapshot> {
    return this.unitOfWork.transaction(async (repository) => {
      const connectionExists = await repository.hasMarketplaceConnection({
        marketplaceConnectionId: input.marketplaceConnectionId,
        sellerId: input.sellerId,
        tenantId: this.context.tenantId,
      });
      if (!connectionExists) {
        throw new DomainError("VALIDATION_FAILED", "Marketplace connection is unavailable.");
      }
      const qualityReport = await repository.loadQualityReport({
        ingestionId: input.ingestionId,
        sellerId: input.sellerId,
        sourceNamespace: input.sourceNamespace,
        tenantId: this.context.tenantId,
      });
      if (qualityReport === null) {
        throw new DomainError("VALIDATION_FAILED", "Ingestion quality evidence is unavailable.");
      }
      const allEvents = await repository.loadEvents({
        cutoffAt: input.cutoffAt,
        ingestionId: input.ingestionId,
        sellerId: input.sellerId,
        sourceNamespace: input.sourceNamespace,
        tenantId: this.context.tenantId,
      });
      const predecessor =
        input.predecessorSnapshotId === undefined
          ? null
          : await repository.findById(this.context.tenantId, input.predecessorSnapshotId);
      if (input.predecessorSnapshotId !== undefined && predecessor === null) {
        throw new DomainError("VALIDATION_FAILED", "Predecessor snapshot is unavailable.");
      }
      if (predecessor !== null) {
        if (
          predecessor.sellerId !== input.sellerId ||
          predecessor.marketplaceConnectionId !== input.marketplaceConnectionId ||
          predecessor.sourceNamespace !== input.sourceNamespace
        ) {
          throw new DomainError("VALIDATION_FAILED", "Predecessor snapshot scope does not match.");
        }
        if (new Date(input.cutoffAt).valueOf() < new Date(predecessor.snapshotCutoffAt).valueOf()) {
          throw new DomainError("VALIDATION_FAILED", "Snapshot cutoff cannot precede its baseline.");
        }
        assertSameMoneyUnit(input.moneyUnit, predecessor.grossUnsettled);
      }

      const predecessorHashes = new Set(predecessor?.includedEventHashes ?? []);
      const incrementalEvents =
        predecessor === null
          ? allEvents
          : allEvents.filter((event) => !predecessorHashes.has(event.sourceRowHash));
      const snapshot = buildDecisionSnapshot({
        createdAt: this.options.now().toISOString(),
        cutoffAt: input.cutoffAt,
        events: incrementalEvents,
        ...(this.options.featureSchemaVersion === undefined
          ? {}
          : { featureSchemaVersion: this.options.featureSchemaVersion }),
        id: this.options.nextId(),
        includedEvents: allEvents,
        marketplaceConnectionId: input.marketplaceConnectionId,
        moneyUnit: input.moneyUnit,
        ...(predecessor === null
          ? {}
          : {
              baseline: {
                firstEventAt: predecessor.firstEventAt,
                grossUnsettled: predecessor.grossUnsettled,
                knownAdjustments: predecessor.knownAdjustments,
                lastEventAt: predecessor.lastEventAt,
                orderCount: predecessor.orderCount,
                realizedToDate: predecessor.realizedToDate,
              },
              predecessorSnapshotId: predecessor.id,
            }),
        qualityReport,
        sellerId: input.sellerId,
        sourceNamespace: input.sourceNamespace,
        tenantId: this.context.tenantId,
      });
      const replay = await repository.findByHash(this.context.tenantId, snapshot.dataSnapshotHash);
      if (replay !== null) return replay;
      return repository.insertOrFind(snapshot);
    });
  }
}
