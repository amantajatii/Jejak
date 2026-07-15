import { canonicalHash } from "./canonical-json.js";
import { safeAttributes } from "./redaction.js";

export class IdempotencyConflictError extends Error {
  readonly code = "IDEMPOTENCY_CONFLICT";
  constructor() {
    super("The idempotency key was already used with a different request.");
  }
}

type ClaimDecision<T> = { kind: "NEW" } | { kind: "REPLAY"; response: T } | { kind: "CONFLICT" };

export type MutationScope = {
  actorId: string;
  idempotencyKey: string;
  operationId: string;
  requestId: string;
  tenantId: string;
};

export type MutationEvent = {
  aggregateId: string;
  aggregateType: string;
  aggregateVersion: number;
  eventType: string;
  payload: Record<string, unknown>;
};

export type MutationTransaction<T> = {
  appendAudit(input: Record<string, unknown>): Promise<void>;
  appendOutbox(input: MutationEvent): Promise<void>;
  claim(scope: MutationScope, payloadHash: string): Promise<ClaimDecision<T>>;
  complete(scope: MutationScope, payloadHash: string, response: T): Promise<void>;
};

export type MutationUnitOfWork<T> = {
  transaction<R>(work: (transaction: MutationTransaction<T>) => Promise<R>): Promise<R>;
};

export class MutationCoordinator<T> {
  constructor(private readonly unitOfWork: MutationUnitOfWork<T>) {}

  execute(input: {
    audit: Record<string, unknown>;
    event: MutationEvent;
    mutate: (transaction: MutationTransaction<T>) => Promise<T>;
    payload: unknown;
    scope: MutationScope;
  }): Promise<T> {
    const payloadHash = canonicalHash({ operationId: input.scope.operationId, payload: input.payload });
    return this.unitOfWork.transaction(async (transaction) => {
      const decision = await transaction.claim(input.scope, payloadHash);
      if (decision.kind === "CONFLICT") throw new IdempotencyConflictError();
      if (decision.kind === "REPLAY") return decision.response;
      const response = await input.mutate(transaction);
      await transaction.appendAudit(safeAttributes({ ...input.audit, payloadHash, result: "SUCCESS" }));
      await transaction.appendOutbox({ ...input.event, payload: safeAttributes(input.event.payload) });
      await transaction.complete(input.scope, payloadHash, response);
      return response;
    });
  }
}
