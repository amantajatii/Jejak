import { describe, expect, it } from "vitest";

import { canonicalHash, canonicalJson } from "../src/reliability/canonical-json.js";
import {
  IdempotencyConflictError,
  MutationCoordinator,
  type MutationScope,
  type MutationTransaction,
  type MutationUnitOfWork,
} from "../src/reliability/mutation-coordinator.js";
import { retryDelayMilliseconds } from "../src/reliability/outbox.js";
import { safeAttributes } from "../src/reliability/redaction.js";

type Response = { id: string };

class MemoryUnitOfWork implements MutationUnitOfWork<Response> {
  audit: unknown[] = [];
  events: unknown[] = [];
  mutations = 0;
  records = new Map<string, { hash: string; response?: Response }>();
  queue = Promise.resolve();

  transaction<R>(work: (transaction: MutationTransaction<Response>) => Promise<R>): Promise<R> {
    const run = async () => {
      const snapshot = { audit: [...this.audit], events: [...this.events], mutations: this.mutations, records: new Map(this.records) };
      try {
        return await work({
          appendAudit: async (item) => { this.audit.push(item); },
          appendOutbox: async (item) => { this.events.push(item); },
          claim: async (scope, hash) => {
            const key = `${scope.tenantId}:${scope.actorId}:${scope.operationId}:${scope.idempotencyKey}`;
            const row = this.records.get(key);
            if (row === undefined) { this.records.set(key, { hash }); return { kind: "NEW" as const }; }
            if (row.hash !== hash) return { kind: "CONFLICT" as const };
            return row.response === undefined ? { kind: "CONFLICT" as const } : { kind: "REPLAY" as const, response: row.response };
          },
          complete: async (scope, hash, response) => {
            this.records.set(`${scope.tenantId}:${scope.actorId}:${scope.operationId}:${scope.idempotencyKey}`, { hash, response });
          },
        });
      } catch (error) {
        this.audit = snapshot.audit; this.events = snapshot.events; this.mutations = snapshot.mutations; this.records = snapshot.records;
        throw error;
      }
    };
    const result = this.queue.then(run, run);
    this.queue = result.then(() => undefined, () => undefined);
    return result;
  }
}

const scope: MutationScope = {
  actorId: "actor", idempotencyKey: "key", operationId: "createClaim", requestId: "request", tenantId: "tenant",
};

describe("atomic mutation foundation", () => {
  it("canonicalizes object keys and hashes equivalent payloads equally", () => {
    expect(canonicalJson({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
    expect(canonicalHash({ b: 2, a: 1 })).toBe(canonicalHash({ a: 1, b: 2 }));
  });

  it("serializes concurrent duplicates into one mutation/event and one replay", async () => {
    const unit = new MemoryUnitOfWork();
    const coordinator = new MutationCoordinator(unit);
    const execute = () => coordinator.execute({
      audit: { action: "claim.created" },
      event: { aggregateId: "claim", aggregateType: "CLAIM", aggregateVersion: 1, eventType: "claim.created", payload: { claimId: "claim" } },
      mutate: async () => { unit.mutations += 1; return { id: "claim" }; }, payload: { amount: "64" }, scope,
    });
    await expect(Promise.all([execute(), execute()])).resolves.toEqual([{ id: "claim" }, { id: "claim" }]);
    expect(unit.mutations).toBe(1); expect(unit.audit).toHaveLength(1); expect(unit.events).toHaveLength(1);
  });

  it("rejects key reuse with a different payload", async () => {
    const unit = new MemoryUnitOfWork(); const coordinator = new MutationCoordinator(unit);
    const base = { audit: {}, event: { aggregateId: "claim", aggregateType: "CLAIM", aggregateVersion: 1, eventType: "claim.created", payload: {} }, mutate: async () => ({ id: "claim" }), scope };
    await coordinator.execute({ ...base, payload: { amount: "64" } });
    await expect(coordinator.execute({ ...base, payload: { amount: "65" } })).rejects.toBeInstanceOf(IdempotencyConflictError);
  });

  it("rolls back idempotency/audit/outbox when mutation fails", async () => {
    const unit = new MemoryUnitOfWork(); const coordinator = new MutationCoordinator(unit);
    await expect(coordinator.execute({
      audit: {}, event: { aggregateId: "claim", aggregateType: "CLAIM", aggregateVersion: 1, eventType: "claim.created", payload: {} },
      mutate: async () => { unit.mutations += 1; throw new Error("injected failure"); }, payload: {}, scope,
    })).rejects.toThrow("injected failure");
    expect(unit.records.size).toBe(0); expect(unit.mutations).toBe(0); expect(unit.audit).toHaveLength(0); expect(unit.events).toHaveLength(0);
  });
});

describe("safe telemetry/event attributes", () => {
  it("redacts secrets recursively", () => {
    expect(
      safeAttributes({
        authorization: "Bearer raw",
        nested: {
          email: "person@example.test",
          signedUrl: "https://private.example.test/object?token=raw",
          status: "ok",
        },
      }),
    ).toEqual({
      authorization: "[REDACTED]",
      nested: { email: "[REDACTED]", signedUrl: "[REDACTED]", status: "ok" },
    });
  });
  it("uses bounded exponential backoff with jitter", () => {
    expect(retryDelayMilliseconds(3, () => 0.5)).toBe(4_000);
    expect(retryDelayMilliseconds(99, () => 0.5)).toBe(60_000);
  });
});
