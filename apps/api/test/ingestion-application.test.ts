import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";

import type { SupabaseJwtVerifier } from "../src/auth/jwt-verifier.js";
import { DeterministicSandboxMarketplaceAdapter } from "../src/modules/ingestion/adapters/deterministic-sandbox.js";
import { CsvIngestionApplication } from "../src/modules/ingestion/application/csv-ingestion-application.js";
import { MarketplaceSyncApplication } from "../src/modules/ingestion/application/marketplace-sync-application.js";
import type {
  IngestionRepository,
  PersistedIngestionResult,
} from "../src/modules/ingestion/application/ingest-csv.js";
import { registerIngestionRoutes } from "../src/modules/ingestion/routes.js";
import { sha256Hex } from "../src/modules/shared/hash.js";
import {
  MutationCoordinator,
  type MutationTransaction,
  type MutationUnitOfWork,
} from "../src/reliability/mutation-coordinator.js";

const tenantId = "01980a12-3456-789a-8abc-def012345678";
const actorId = "01980a12-3456-789a-8abc-def012345679";
const membershipId = "01980a12-3456-789a-8abc-def012345670";
const roleGrantId = "01980a12-3456-789a-8abc-def012345671";
const sellerId = "01980a12-3456-789a-8abc-def012345672";
const header = "external_event_id,event_type,occurred_at,amount_minor,currency,scale";

class MemoryMutationUnit implements MutationUnitOfWork<PersistedIngestionResult> {
  audit: unknown[] = [];
  outbox: unknown[] = [];
  private records = new Map<string, { hash: string; response?: PersistedIngestionResult }>();

  async transaction<T>(
    work: (transaction: MutationTransaction<PersistedIngestionResult>) => Promise<T>,
  ): Promise<T> {
    return work({
      appendAudit: async (value) => {
        this.audit.push(value);
      },
      appendOutbox: async (value) => {
        this.outbox.push(value);
      },
      claim: async (scope, hash) => {
        const key = `${scope.tenantId}:${scope.actorId}:${scope.operationId}:${scope.idempotencyKey}`;
        const record = this.records.get(key);
        if (record === undefined) {
          this.records.set(key, { hash });
          return { kind: "NEW" as const };
        }
        if (record.hash !== hash || record.response === undefined) return { kind: "CONFLICT" as const };
        return { kind: "REPLAY" as const, response: record.response };
      },
      complete: async (scope, hash, response) => {
        this.records.set(
          `${scope.tenantId}:${scope.actorId}:${scope.operationId}:${scope.idempotencyKey}`,
          { hash, response },
        );
      },
    });
  }
}

describe("tenant-scoped CSV ingestion application", () => {
  it("replays atomically and keeps the private object reference out of audit/outbox", async () => {
    const body = new TextEncoder().encode(
      `${header}\nevent-1,ORDER_SETTLED,2026-07-15T00:00:00Z,100,TIDR,2`,
    );
    const unit = new MemoryMutationUnit();
    const persist = vi.fn(async (input: Parameters<IngestionRepository["persist"]>[0]) => ({
      ingestionId: "01980a12-3456-789a-8abc-def012345673",
      replayed: false,
      report: input.report,
    }));
    const repository: IngestionRepository = {
      findById: vi.fn().mockResolvedValue(null),
      findConnection: vi.fn().mockResolvedValue(null),
      persist,
    };
    const application = new CsvIngestionApplication({
      context: {
        actorId,
        idempotencyKey: "idempotency-key-0001",
        membershipId,
        requestId: "request-1",
        roleGrantId,
        tenantId,
      },
      coordinator: new MutationCoordinator(unit),
      reader: { read: vi.fn().mockResolvedValue(body) },
      repository: () => repository,
    });
    const input = {
      contentHash: sha256Hex(body),
      sellerId,
      storageObjectKey: "tenant/private/credential-shaped-object.csv",
    };

    const first = await application.ingest(input);
    const replay = await application.ingest(input);

    expect(replay).toEqual(first);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith(expect.objectContaining({ tenantId }));
    const durableEvidence = JSON.stringify({ audit: unit.audit, outbox: unit.outbox });
    expect(durableEvidence).not.toContain(input.storageObjectKey);
    expect(durableEvidence).toContain(input.contentHash);
  });

  it("exposes an isolated authenticated route registrar", async () => {
    const app = Fastify({ logger: false });
    const ingestCsv = vi.fn().mockResolvedValue({
      ingestionId: "01980a12-3456-789a-8abc-def012345673",
      replayed: false,
      report: {
        duplicateRows: 0,
        format: "JEJAK_CANONICAL_CSV_V1",
        issues: [],
        qualityScoreBps: 10_000,
        rejectedRows: 0,
        totalRows: 1,
        validUniqueRows: 1,
      },
    });
    await registerIngestionRoutes(app, {
      findIngestion: vi.fn().mockResolvedValue(null),
      findMembership: vi.fn().mockResolvedValue({
        actorId,
        grants: [{ grantId: roleGrantId, role: "SELLER" }],
        membershipId,
        tenantId,
      }),
      ingestCsv,
      syncMarketplace: vi.fn().mockResolvedValue({
        ingestionId: "01980a12-3456-789a-8abc-def012345674",
        replayed: false,
        report: {
          duplicateRows: 0,
          format: "JEJAK_MARKETPLACE_BATCH_V1",
          issues: [],
          qualityScoreBps: 10_000,
          rejectedRows: 0,
          totalRows: 1,
          validUniqueRows: 1,
        },
      }),
      verifier: { verify: vi.fn().mockResolvedValue({ subject: actorId }) } as unknown as SupabaseJwtVerifier,
    });
    const body = `${header}\nevent-1,ORDER_SETTLED,2026-07-15T00:00:00Z,100,TIDR,2`;
    const response = await app.inject({
      body: {
        contentHash: sha256Hex(body),
        sellerId,
        storageObjectKey: "private/object.csv",
      },
      headers: {
        authorization: "Bearer header.payload.signature",
        "idempotency-key": "idempotency-key-0001",
        "x-jejak-tenant-id": tenantId,
      },
      method: "POST",
      url: "/v1/ingestions/csv",
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({ data: { status: "COMPLETED" } });
    expect(ingestCsv).toHaveBeenCalledWith(
      expect.objectContaining({ actorId, tenantId }),
      expect.objectContaining({ sellerId }),
    );
    await app.close();
  });
});

describe("deterministic marketplace sandbox adapter", () => {
  it("returns a provider-neutral stable batch and explicit missing-data evidence", async () => {
    const adapter = new DeterministicSandboxMarketplaceAdapter({
      connection: [
        {
          amount: { amountMinor: "100", currency: "TIDR", scale: 2 },
          eventType: "ORDER_SETTLED",
          externalEventId: "event-1",
          occurredAt: "2026-07-15T00:00:00Z",
        },
      ],
    });
    expect(await adapter.fetch({ marketplaceConnectionId: "connection" })).toEqual(
      await adapter.fetch({ marketplaceConnectionId: "connection" }),
    );
    const empty = await adapter.fetch({ marketplaceConnectionId: "missing" });
    expect(empty.report).toMatchObject({
      qualityScoreBps: 0,
      issues: [{ blocksAutomation: true, code: "MISSING_PAYOUT_HISTORY" }],
    });
  });

  it("persists a tenant-scoped connection batch through the atomic application boundary", async () => {
    const connectionId = "01980a12-3456-789a-8abc-def012345674";
    const adapter = new DeterministicSandboxMarketplaceAdapter({
      [connectionId]: [
        {
          amount: { amountMinor: "100", currency: "TIDR", scale: 2 },
          eventType: "ORDER_SETTLED",
          externalEventId: "event-1",
          occurredAt: "2026-07-15T00:00:00Z",
        },
      ],
    });
    const unit = new MemoryMutationUnit();
    const persist = vi.fn(async (input: Parameters<IngestionRepository["persist"]>[0]) => ({
      ingestionId: "01980a12-3456-789a-8abc-def012345675",
      replayed: false,
      report: input.report,
    }));
    const repository: IngestionRepository = {
      findById: vi.fn().mockResolvedValue(null),
      findConnection: vi.fn().mockResolvedValue({ sellerId }),
      persist,
    };
    const application = new MarketplaceSyncApplication({
      adapter,
      context: {
        actorId,
        idempotencyKey: "idempotency-key-sync-1",
        membershipId,
        requestId: "request-sync",
        roleGrantId,
        tenantId,
      },
      coordinator: new MutationCoordinator(unit),
      repository: () => repository,
    });

    const result = await application.sync({ marketplaceConnectionId: connectionId });
    expect(result.report.format).toBe("JEJAK_MARKETPLACE_BATCH_V1");
    expect(repository.findConnection).toHaveBeenCalledWith(tenantId, connectionId);
    expect(persist).toHaveBeenCalledWith(
      expect.objectContaining({ sellerId, tenantId }),
    );
    expect(persist.mock.calls[0]?.[0]).not.toHaveProperty("storageObjectKey");
    expect(JSON.stringify({ audit: unit.audit, outbox: unit.outbox })).not.toContain("credential");
  });
});
