import { describe, expect, it } from "vitest";

import type { CanonicalMarketplaceEvent } from "../src/modules/ingestion/domain/types.js";
import {
  DecisionSnapshotApplication,
  type DecisionInputRepository,
  type DecisionSnapshotUnitOfWork,
} from "../src/modules/reconciliation/application/create-decision-snapshot.js";
import type { DecisionSnapshot } from "../src/modules/reconciliation/domain/snapshot.js";
import { canonicalHash } from "../src/modules/shared/hash.js";

const tenantId = "01980a12-3456-789a-8abc-def012345678";
const sellerId = "01980a12-3456-789a-8abc-def012345672";
const connectionId = "01980a12-3456-789a-8abc-def012345673";
const ingestionId = "01980a12-3456-789a-8abc-def012345674";
const moneyUnit = { amountMinor: "0", currency: "TIDR", scale: 2 };

function event(
  externalEventId: string,
  eventType: CanonicalMarketplaceEvent["eventType"],
  occurredAt: string,
  amountMinor: string,
): CanonicalMarketplaceEvent {
  const safe = {
    amount: { ...moneyUnit, amountMinor },
    eventType,
    externalEventId,
    occurredAt,
  };
  return {
    ...safe,
    sourceRowHash: canonicalHash(safe),
    sourceRowNumber: Number(externalEventId.at(-1)) + 1,
  };
}

class MemoryDecisionRepository implements DecisionInputRepository {
  snapshots = new Map<string, DecisionSnapshot>();
  events = [
    event("event-1", "ORDER_SETTLED", "2026-07-15T00:01:00Z", "10000"),
    event("event-2", "REFUND", "2026-07-15T00:02:00Z", "1000"),
  ];
  requestedTenants: string[] = [];

  async hasMarketplaceConnection(input: {
    marketplaceConnectionId: string;
    sellerId: string;
    tenantId: string;
  }): Promise<boolean> {
    this.requestedTenants.push(input.tenantId);
    return (
      input.tenantId === tenantId &&
      input.sellerId === sellerId &&
      input.marketplaceConnectionId === connectionId
    );
  }

  async insert(snapshot: DecisionSnapshot): Promise<void> {
    this.snapshots.set(snapshot.id, structuredClone(snapshot));
  }

  async insertOrFind(snapshot: DecisionSnapshot): Promise<DecisionSnapshot> {
    const existing = await this.findByHash(snapshot.tenantId, snapshot.dataSnapshotHash);
    if (existing !== null) return existing;
    await this.insert(snapshot);
    return snapshot;
  }

  async findById(tenant: string, snapshotId: string): Promise<DecisionSnapshot | null> {
    const snapshot = this.snapshots.get(snapshotId);
    return snapshot?.tenantId === tenant ? structuredClone(snapshot) : null;
  }

  async findByHash(tenant: string, hash: string): Promise<DecisionSnapshot | null> {
    return (
      [...this.snapshots.values()].find(
        (snapshot) => snapshot.tenantId === tenant && snapshot.dataSnapshotHash === hash,
      ) ?? null
    );
  }

  async loadEvents(input: {
    cutoffAt: string;
    ingestionId: string;
    sellerId: string;
    sourceNamespace: string;
    tenantId: string;
  }): Promise<CanonicalMarketplaceEvent[]> {
    this.requestedTenants.push(input.tenantId);
    if (
      input.tenantId !== tenantId ||
      input.sellerId !== sellerId ||
      input.ingestionId !== ingestionId ||
      input.sourceNamespace !== "CSV"
    ) {
      return [];
    }
    return this.events.filter(
      (candidate) => new Date(candidate.occurredAt).valueOf() <= new Date(input.cutoffAt).valueOf(),
    );
  }

  async loadQualityReport(input: {
    ingestionId: string;
    sellerId: string;
    sourceNamespace: string;
    tenantId: string;
  }) {
    this.requestedTenants.push(input.tenantId);
    if (
      input.tenantId !== tenantId ||
      input.sellerId !== sellerId ||
      input.ingestionId !== ingestionId ||
      input.sourceNamespace !== "CSV"
    ) {
      return null;
    }
    return {
      duplicateRows: 0,
      format: "JEJAK_CANONICAL_CSV_V1" as const,
      issues: [],
      qualityScoreBps: 10_000,
      rejectedRows: 0,
      totalRows: 2,
      validUniqueRows: 2,
    };
  }
}

describe("decision snapshot application", () => {
  it("replays identical input and creates an immutable incremental successor", async () => {
    const repository = new MemoryDecisionRepository();
    const unit: DecisionSnapshotUnitOfWork = {
      transaction: (work) => work(repository),
    };
    let id = 0;
    const application = new DecisionSnapshotApplication(
      { actorId: "actor", requestId: "request", tenantId },
      unit,
      {
        nextId: () => `snapshot-${++id}`,
        now: () => new Date(`2026-07-15T00:0${id}:30Z`),
      },
    );
    const firstInput = {
      cutoffAt: "2026-07-15T00:01:00Z",
      ingestionId,
      marketplaceConnectionId: connectionId,
      moneyUnit,
      sellerId,
      sourceNamespace: "CSV",
    };

    const first = await application.create(firstInput);
    const replay = await application.create(firstInput);
    expect(replay).toEqual(first);
    expect(repository.snapshots.size).toBe(1);

    const successor = await application.create({
      ...firstInput,
      cutoffAt: "2026-07-15T00:02:00Z",
      predecessorSnapshotId: first.id,
    });
    expect(successor.id).not.toBe(first.id);
    expect(successor.dataSnapshotHash).not.toBe(first.dataSnapshotHash);
    expect(successor).toMatchObject({
      grossUnsettled: { amountMinor: "10000" },
      knownAdjustments: { amountMinor: "1000" },
      predecessorSnapshotId: first.id,
    });
    expect(successor.includedEventIdentities).toEqual(["CSV:event-1", "CSV:event-2"]);
    expect(repository.snapshots.get(first.id)).toEqual(first);
  });

  it("uses only the active tenant when loading events and quality evidence", async () => {
    const repository = new MemoryDecisionRepository();
    const unit: DecisionSnapshotUnitOfWork = { transaction: (work) => work(repository) };
    const otherTenant = "01980a12-3456-789a-8abc-def012345699";
    const application = new DecisionSnapshotApplication(
      { actorId: "actor", requestId: "request", tenantId: otherTenant },
      unit,
      { nextId: () => "snapshot-other", now: () => new Date("2026-07-15T00:03:00Z") },
    );

    await expect(
      application.create({
        cutoffAt: "2026-07-15T00:02:00Z",
        ingestionId,
        marketplaceConnectionId: connectionId,
        moneyUnit,
        sellerId,
        sourceNamespace: "CSV",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(repository.requestedTenants).toEqual([otherTenant]);
    expect(repository.snapshots.size).toBe(0);
  });
});
