import { IdempotencyConflictError } from "../../reliability/mutation-coordinator.js";
import { assertExpectedVersion } from "../control/index.js";
import { DomainError } from "../shared/errors.js";
import type { RefundSpikeRepository, RefundSpikeResult } from "./refund-spike-service.js";

export class InMemoryRefundSpikeRepository implements RefundSpikeRepository {
  readonly events: Array<{ claimId: string; eventId: string; eventType: "REFUND" }> = [];
  readonly operations: Array<{ claimId: string; operationId: string; status: "QUEUED" }> = [];
  readonly #claims = new Map<string, { state: string; version: number }>();
  readonly #commands = new Map<string, { payloadHash: string; result: RefundSpikeResult }>();
  #sequence = 0;

  seed(input: { claimId: string; state: string; version: number }): void { this.#claims.set(input.claimId, { state: input.state, version: input.version }); }

  async inject(input: Parameters<RefundSpikeRepository["inject"]>[0]): Promise<RefundSpikeResult> {
    const scope = `${input.context.tenantId}:${input.context.actorId}:${input.context.idempotencyKey}`;
    const existing = this.#commands.get(scope);
    if (existing !== undefined) {
      if (existing.payloadHash !== input.payloadHash) throw new IdempotencyConflictError();
      return { ...existing.result, replayed: true };
    }
    if (this.events.some((event) => event.claimId === input.claimId)) throw new IdempotencyConflictError();
    const claim = this.#claims.get(input.claimId);
    if (claim === undefined || !["FUNDED", "SETTLING", "PAUSED"].includes(claim.state)) throw new DomainError("INVALID_STATE_TRANSITION", "Refund spike requires an active funded claim.");
    assertExpectedVersion(claim.version, input.expectedVersion);
    const eventId = `refund-event-${++this.#sequence}`;
    const operationId = `risk-operation-${this.#sequence}`;
    const result: RefundSpikeResult = { claimId: input.claimId, eventId, operationId, replayed: false, status: "QUEUED", version: claim.version + 1 };
    this.events.push({ claimId: input.claimId, eventId, eventType: "REFUND" });
    this.operations.push({ claimId: input.claimId, operationId, status: "QUEUED" });
    this.#claims.set(input.claimId, { ...claim, version: result.version });
    this.#commands.set(scope, { payloadHash: input.payloadHash, result });
    return result;
  }
}

