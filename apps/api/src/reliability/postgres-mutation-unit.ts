import { and, eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";

import type { JejakDatabase } from "../db/client.js";
import { withTenantTransaction, type TransactionActorContext } from "../db/context.js";
import { auditEvents, idempotencyRecords, outboxEvents } from "../db/schema/reliability.js";
import { canonicalHash } from "./canonical-json.js";
import type {
  MutationEvent,
  MutationScope,
  MutationTransaction,
  MutationUnitOfWork,
} from "./mutation-coordinator.js";

export type PostgresMutationTransaction<T> = MutationTransaction<T> & {
  database: JejakDatabase;
};

type AuditInput = {
  action?: string;
  resourceType?: string;
  resourceId?: string;
  beforeVersion?: number;
  afterVersion?: number;
  reasonCode?: string;
  payloadHash?: string;
  result?: string;
  [key: string]: unknown;
};

export class PostgresMutationUnitOfWork<T>
  implements MutationUnitOfWork<T, PostgresMutationTransaction<T>>
{
  constructor(
    private readonly database: JejakDatabase,
    private readonly actorContext: TransactionActorContext,
    private readonly options: {
      nextId?: () => string;
      now?: () => Date;
      idempotencyTtlMs?: number;
    } = {},
  ) {}

  transaction<R>(work: (transaction: PostgresMutationTransaction<T>) => Promise<R>): Promise<R> {
    return withTenantTransaction(this.database, this.actorContext, async (database) => {
      let activeScope: MutationScope | undefined;
      const now = this.options.now ?? (() => new Date());
      const nextId = this.options.nextId ?? uuidv7;
      const transaction: PostgresMutationTransaction<T> = {
        database,
        claim: async (scope, payloadHash) => {
          activeScope = scope;
          const [inserted] = await database
            .insert(idempotencyRecords)
            .values({
              id: nextId(),
              tenantId: scope.tenantId,
              actorId: scope.actorId,
              operationId: scope.operationId,
              idempotencyKey: scope.idempotencyKey,
              payloadHash,
              expiresAt: new Date(now().valueOf() + (this.options.idempotencyTtlMs ?? 86_400_000)),
            })
            .onConflictDoNothing()
            .returning({ id: idempotencyRecords.id });
          if (inserted !== undefined) return { kind: "NEW" as const };
          const [existing] = await database
            .select({
              payloadHash: idempotencyRecords.payloadHash,
              responseBody: idempotencyRecords.responseBody,
            })
            .from(idempotencyRecords)
            .where(
              and(
                eq(idempotencyRecords.tenantId, scope.tenantId),
                eq(idempotencyRecords.actorId, scope.actorId),
                eq(idempotencyRecords.operationId, scope.operationId),
                eq(idempotencyRecords.idempotencyKey, scope.idempotencyKey),
              ),
            )
            .limit(1);
          if (existing === undefined || existing.payloadHash !== payloadHash) {
            return { kind: "CONFLICT" as const };
          }
          if (existing.responseBody === null) return { kind: "CONFLICT" as const };
          return { kind: "REPLAY" as const, response: existing.responseBody as T };
        },
        appendAudit: async (rawInput) => {
          const scope = activeScope;
          if (scope === undefined) throw new Error("Idempotency scope must be claimed before audit.");
          const input = rawInput as AuditInput;
          await database.insert(auditEvents).values({
            id: nextId(),
            tenantId: scope.tenantId,
            actorId: scope.actorId,
            ...(this.actorContext.membershipId === undefined
              ? {}
              : { membershipId: this.actorContext.membershipId }),
            ...(this.actorContext.roleGrantId === undefined
              ? {}
              : { roleGrantId: this.actorContext.roleGrantId }),
            requestId: scope.requestId,
            idempotencyKey: scope.idempotencyKey,
            action: input.action ?? scope.operationId,
            resourceType: input.resourceType ?? "UNKNOWN",
            ...(input.resourceId === undefined ? {} : { resourceId: input.resourceId }),
            ...(input.beforeVersion === undefined ? {} : { beforeVersion: input.beforeVersion }),
            ...(input.afterVersion === undefined ? {} : { afterVersion: input.afterVersion }),
            ...(input.reasonCode === undefined ? {} : { reasonCode: input.reasonCode }),
            ...(input.payloadHash === undefined ? {} : { payloadHash: input.payloadHash }),
            result: input.result ?? "SUCCESS",
            references: rawInput,
            createdAt: now(),
          });
        },
        appendOutbox: async (event: MutationEvent) => {
          const scope = activeScope;
          if (scope === undefined) throw new Error("Idempotency scope must be claimed before outbox.");
          await database.insert(outboxEvents).values({
            id: nextId(),
            tenantId: scope.tenantId,
            aggregateType: event.aggregateType,
            aggregateId: event.aggregateId,
            aggregateVersion: event.aggregateVersion,
            eventType: event.eventType,
            eventVersion: 1,
            idempotencyKey: scope.idempotencyKey,
            payload: event.payload,
            createdAt: now(),
            nextAttemptAt: now(),
          });
        },
        complete: async (scope, payloadHash, response, responseStatus) => {
          await database
            .update(idempotencyRecords)
            .set({
              responseStatus,
              responseBody: response,
              responseHash: canonicalHash(response),
              completedAt: now(),
            })
            .where(
              and(
                eq(idempotencyRecords.tenantId, scope.tenantId),
                eq(idempotencyRecords.actorId, scope.actorId),
                eq(idempotencyRecords.operationId, scope.operationId),
                eq(idempotencyRecords.idempotencyKey, scope.idempotencyKey),
                eq(idempotencyRecords.payloadHash, payloadHash),
              ),
            );
        },
      };
      return work(transaction);
    });
  }
}
