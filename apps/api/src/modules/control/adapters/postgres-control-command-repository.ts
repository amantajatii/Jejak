import { and, desc, eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";

import type { JejakDatabase } from "../../../db/client.js";
import { applyTransactionContext } from "../../../db/context.js";
import { auditEvents, claims, controlEvidence, idempotencyRecords, outboxEvents } from "../../../db/schema/index.js";
import { IdempotencyConflictError } from "../../../reliability/mutation-coordinator.js";
import { DomainError } from "../../shared/errors.js";
import {
  assertExpectedVersion,
  assertMutableClaimState,
  type ControlClaimResult,
  type ControlCommandRepository,
  type SafeControlEvidence,
} from "../application/claim-command-service.js";

type JsonObject = Record<string, unknown>;

export class PostgresControlCommandRepository implements ControlCommandRepository {
  constructor(
    private readonly database: JejakDatabase,
    private readonly options: { mode: "SANDBOX" | "PRODUCTION"; nextId?: () => string; now?: () => Date; idempotencyTtlMs?: number },
  ) {}

  submitEvidence(input: Parameters<ControlCommandRepository["submitEvidence"]>[0]): Promise<SafeControlEvidence> {
    return this.database.transaction(async (transaction) => {
      const database = transaction as JejakDatabase;
      await applyTransactionContext(database, input.context);
      const replay = await this.#claimIdempotency<SafeControlEvidence>(database, input, "submitControlEvidence");
      if (replay !== undefined) return replay;
      const claim = await lockClaim(database, input.context.tenantId, input.claimId);
      assertExpectedVersion(claim.version, input.expectedVersion);
      if (!["ELIGIBLE", "CONTROLLED"].includes(claim.state)) {
        throw new DomainError("INVALID_STATE_TRANSITION", "Control evidence requires an eligible claim.");
      }
      const now = this.#now();
      const evidence: SafeControlEvidence = {
        claimId: input.claimId,
        createdAt: now.toISOString(),
        evidenceHash: input.evidenceHash,
        id: this.#id(),
        mode: this.options.mode,
        reasonCodes: [],
        status: "PENDING",
        structure: structure(input.evidenceType),
        updatedAt: now.toISOString(),
        version: 1,
      };
      await database.insert(controlEvidence).values({
        canonicalPayload: evidence,
        claimId: input.claimId,
        evidenceHash: input.evidenceHash,
        id: evidence.id,
        status: evidence.status,
        tenantId: input.context.tenantId,
      });
      await updateClaim(database, claim, {
        controlEvidenceId: evidence.id,
        updatedAt: now.toISOString(),
        version: claim.version + 1,
      }, now);
      await this.#record(database, input, "control.evidence.submitted", "CONTROL_EVIDENCE", evidence.id, claim.version, claim.version + 1, [], {
        claimId: input.claimId,
        evidenceHash: input.evidenceHash,
        evidenceId: evidence.id,
        status: evidence.status,
      });
      await this.#complete(database, input, "submitControlEvidence", evidence, evidence.id, 201);
      return evidence;
    });
  }

  decide(input: Parameters<ControlCommandRepository["decide"]>[0]): Promise<SafeControlEvidence> {
    return this.database.transaction(async (transaction) => {
      const database = transaction as JejakDatabase;
      await applyTransactionContext(database, input.context);
      const replay = await this.#claimIdempotency<SafeControlEvidence>(database, input, "decideControlEvidence");
      if (replay !== undefined) return replay;
      const claim = await lockClaim(database, input.context.tenantId, input.claimId);
      assertExpectedVersion(claim.version, input.expectedVersion);
      assertMutableClaimState(claim.state);
      const [row] = await database.select().from(controlEvidence).where(and(
        eq(controlEvidence.tenantId, input.context.tenantId),
        eq(controlEvidence.claimId, input.claimId),
      )).orderBy(desc(controlEvidence.updatedAt), desc(controlEvidence.id)).limit(1).for("update");
      if (row === undefined) throw new DomainError("INVALID_STATE_TRANSITION", "No control evidence exists for this claim.");
      const previous = safeEvidence(row.canonicalPayload);
      if (input.decision === "VERIFY" && !["PENDING", "VERIFIED"].includes(previous.status)) {
        throw new DomainError("INVALID_STATE_TRANSITION", "Rejected or revoked control evidence cannot be verified.");
      }
      const status = input.decision === "VERIFY" ? "VERIFIED" : input.decision === "REJECT" ? "REJECTED" : "REVOKED";
      const now = this.#now();
      const evidence: SafeControlEvidence = {
        ...previous,
        reasonCodes: input.reasonCodes,
        status,
        updatedAt: now.toISOString(),
        ...(status === "VERIFIED" ? { verifiedAt: now.toISOString(), verifiedBy: input.context.actorId } : {}),
        version: row.version + 1,
      };
      await database.update(controlEvidence).set({ canonicalPayload: evidence, status, updatedAt: now, version: row.version + 1 }).where(and(
        eq(controlEvidence.tenantId, input.context.tenantId), eq(controlEvidence.id, row.id), eq(controlEvidence.version, row.version),
      ));
      const state = status === "VERIFIED" ? "CONTROLLED" : status === "REVOKED" ? "SUSPENDED" : claim.state;
      await updateClaim(database, claim, {
        controlEvidenceId: row.id,
        state,
        stateReasonCodes: input.reasonCodes,
        updatedAt: now.toISOString(),
        version: claim.version + 1,
      }, now);
      await this.#record(database, input, `control.${status.toLowerCase()}`, "CONTROL_EVIDENCE", row.id, claim.version, claim.version + 1, input.reasonCodes, {
        claimId: input.claimId, evidenceHash: evidence.evidenceHash, evidenceId: row.id, status,
      });
      await this.#complete(database, input, "decideControlEvidence", evidence, row.id, 200);
      return evidence;
    });
  }

  pause(input: Parameters<ControlCommandRepository["pause"]>[0]): Promise<ControlClaimResult> {
    return this.database.transaction(async (transaction) => {
      const database = transaction as JejakDatabase;
      await applyTransactionContext(database, input.context);
      const replay = await this.#claimIdempotency<ControlClaimResult>(database, input, "pauseClaim");
      if (replay !== undefined) return replay;
      const claim = await lockClaim(database, input.context.tenantId, input.claimId);
      assertExpectedVersion(claim.version, input.expectedVersion);
      assertMutableClaimState(claim.state);
      const now = this.#now();
      const result: ControlClaimResult = { claimId: claim.id, reasonCodes: input.reasonCodes, state: "PAUSED", version: claim.version + 1 };
      await updateClaim(database, claim, {
        state: result.state,
        stateReasonCodes: input.reasonCodes,
        updatedAt: now.toISOString(),
        version: result.version,
      }, now);
      await this.#record(database, input, "security.circuit_breaker.triggered", "CLAIM", claim.id, claim.version, result.version, input.reasonCodes, result);
      await this.#complete(database, input, "pauseClaim", result, claim.id, 200);
      return result;
    });
  }

  async #claimIdempotency<T>(database: JejakDatabase, input: { context: Parameters<ControlCommandRepository["pause"]>[0]["context"]; payloadHash: string }, operationId: string): Promise<T | undefined> {
    const [row] = await database.select().from(idempotencyRecords).where(and(
      eq(idempotencyRecords.tenantId, input.context.tenantId),
      eq(idempotencyRecords.actorId, input.context.actorId),
      eq(idempotencyRecords.operationId, operationId),
      eq(idempotencyRecords.idempotencyKey, input.context.idempotencyKey),
    )).limit(1).for("update");
    if (row !== undefined) {
      if (row.payloadHash !== input.payloadHash) throw new IdempotencyConflictError();
      if (row.responseBody !== null) return row.responseBody as T;
      throw new DomainError("INVALID_STATE_TRANSITION", "The matching command is still processing.");
    }
    await database.insert(idempotencyRecords).values({
      actorId: input.context.actorId,
      expiresAt: new Date(this.#now().getTime() + (this.options.idempotencyTtlMs ?? 86_400_000)),
      id: this.#id(),
      idempotencyKey: input.context.idempotencyKey,
      operationId,
      payloadHash: input.payloadHash,
      tenantId: input.context.tenantId,
    });
    return undefined;
  }

  async #complete(database: JejakDatabase, input: { context: Parameters<ControlCommandRepository["pause"]>[0]["context"]; payloadHash: string }, operationId: string, response: unknown, resourceId: string, status: number) {
    const now = this.#now();
    await database.update(idempotencyRecords).set({ completedAt: now, resourceId, resourceType: "CLAIM", responseBody: response, responseStatus: status }).where(and(
      eq(idempotencyRecords.tenantId, input.context.tenantId), eq(idempotencyRecords.actorId, input.context.actorId),
      eq(idempotencyRecords.operationId, operationId), eq(idempotencyRecords.idempotencyKey, input.context.idempotencyKey),
      eq(idempotencyRecords.payloadHash, input.payloadHash),
    ));
  }

  async #record(database: JejakDatabase, input: { claimId: string; context: Parameters<ControlCommandRepository["pause"]>[0]["context"]; payloadHash: string }, action: string, resourceType: string, resourceId: string, beforeVersion: number, afterVersion: number, reasonCodes: readonly string[], payload: JsonObject) {
    const now = this.#now();
    await database.insert(auditEvents).values({
      action, actorId: input.context.actorId, afterVersion, beforeVersion, createdAt: now,
      id: this.#id(), idempotencyKey: input.context.idempotencyKey, membershipId: input.context.membershipId,
      payloadHash: input.payloadHash, reasonCode: reasonCodes[0], requestId: input.context.requestId,
      resourceId, resourceType, result: "SUCCESS", roleGrantId: input.context.roleGrantId, tenantId: input.context.tenantId,
      references: { claimId: input.claimId, reasonCodes },
    });
    await database.insert(outboxEvents).values({
      aggregateId: input.claimId, aggregateType: "CLAIM", aggregateVersion: afterVersion, createdAt: now,
      eventType: action, eventVersion: 1, id: this.#id(), idempotencyKey: input.context.idempotencyKey,
      nextAttemptAt: now, payload, tenantId: input.context.tenantId,
    });
  }

  #id() { return (this.options.nextId ?? uuidv7)(); }
  #now() { return (this.options.now ?? (() => new Date()))(); }
}

async function lockClaim(database: JejakDatabase, tenantId: string, claimId: string) {
  const [claim] = await database.select().from(claims).where(and(eq(claims.tenantId, tenantId), eq(claims.id, claimId))).limit(1).for("update");
  if (claim === undefined) throw new DomainError("INVALID_STATE_TRANSITION", "Claim was not found in the selected tenant.");
  return claim;
}

async function updateClaim(database: JejakDatabase, claim: Awaited<ReturnType<typeof lockClaim>>, changes: JsonObject, now: Date) {
  await database.update(claims).set({
    canonicalPayload: { ...object(claim.canonicalPayload), ...changes },
    ...(typeof changes.state === "string" ? { state: changes.state } : {}),
    updatedAt: now,
    version: Number(changes.version),
  }).where(and(eq(claims.tenantId, claim.tenantId), eq(claims.id, claim.id), eq(claims.version, claim.version)));
}

function structure(type: "ASSIGNMENT_NOTICE" | "ACCOUNT_CONTROL" | "MARKETPLACE_ACKNOWLEDGEMENT"): SafeControlEvidence["structure"] {
  if (type === "ASSIGNMENT_NOTICE") return "ASSIGNMENT";
  if (type === "ACCOUNT_CONTROL") return "CONTROLLED_ACCOUNT";
  return "PARTICIPATION";
}

function safeEvidence(value: unknown): SafeControlEvidence {
  const item = object(value);
  if (typeof item.id !== "string" || typeof item.claimId !== "string" || typeof item.evidenceHash !== "string" || typeof item.version !== "number") {
    throw new Error("Persisted control evidence is malformed.");
  }
  return item as SafeControlEvidence;
}

function object(value: unknown): JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as JsonObject : {};
}

