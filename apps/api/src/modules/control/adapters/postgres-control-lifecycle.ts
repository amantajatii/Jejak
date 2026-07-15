import { and, eq, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";

import type { JejakDatabase } from "../../../db/client.js";
import { withTenantTransaction } from "../../../db/context.js";
import { claims, controlEvidence } from "../../../db/schema/domain.js";
import { auditEvents, idempotencyRecords, operationSteps, operations, outboxEvents } from "../../../db/schema/reliability.js";
import { canonicalHash } from "../../../reliability/canonical-json.js";
import type { ControlEvidenceLifecycleRepository } from "../ports/control-lifecycle.js";

export class PostgresControlEvidenceLifecycleRepository implements ControlEvidenceLifecycleRepository {
  constructor(private readonly database: JejakDatabase, private readonly nextId: () => string = uuidv7, private readonly now: () => Date = () => new Date()) {}

  attachFinalizedDecision(input: Parameters<ControlEvidenceLifecycleRepository["attachFinalizedDecision"]>[0]): Promise<void> {
    return withTenantTransaction(this.database, input.context, async (database) => {
      const [idempotency] = await database.select({ resourceId: idempotencyRecords.resourceId }).from(idempotencyRecords).where(and(
        eq(idempotencyRecords.tenantId, input.context.tenantId), eq(idempotencyRecords.actorId, input.context.actorId),
        eq(idempotencyRecords.operationId, input.context.operationId), eq(idempotencyRecords.idempotencyKey, input.context.idempotencyKey),
      )).limit(1);
      if (idempotency?.resourceId === null || idempotency === undefined) throw new Error("Control operation journal is missing.");
      const now = this.now();
      await database.select({ id: operations.id }).from(operations).where(and(eq(operations.tenantId, input.context.tenantId), eq(operations.id, idempotency.resourceId))).for("update").limit(1);
      const [prior] = await database.select({ safeResult: operationSteps.safeResult }).from(operationSteps).where(and(
        eq(operationSteps.tenantId, input.context.tenantId), eq(operationSteps.operationId, idempotency.resourceId), eq(operationSteps.name, "FINALIZE_EVIDENCE"),
      )).limit(1);
      const metadata = {
        contentType: input.evidence.contentType,
        documentSecretRef: input.evidence.documentSecretRef,
        evidenceHash: input.evidence.sha256,
        evidenceVersion: input.evidence.version,
        finalizedAt: input.evidence.finalizedAt.toISOString(),
        receiptHash: input.receipt.receiptHash,
        sizeBytes: input.evidence.sizeBytes,
        status: input.receipt.status,
      };
      if (prior !== undefined) {
        if (canonicalHash(prior.safeResult) !== canonicalHash(metadata)) throw new Error("Finalized evidence metadata conflicts with the committed lifecycle.");
        return;
      }
      const [evidenceRow] = await database.select({ canonicalPayload: controlEvidence.canonicalPayload, version: controlEvidence.version }).from(controlEvidence).where(and(
        eq(controlEvidence.tenantId, input.context.tenantId), eq(controlEvidence.id, input.evidence.evidenceId), eq(controlEvidence.claimId, input.context.claimId),
      )).for("update").limit(1);
      if (evidenceRow === undefined) throw new Error("Control evidence draft is missing.");
      await database.update(controlEvidence).set({
        canonicalPayload: { ...(asObject(evidenceRow.canonicalPayload)), ...metadata },
        documentSecretRef: input.evidence.documentSecretRef, evidenceHash: input.evidence.sha256,
        status: input.receipt.status, updatedAt: now, version: sql`${controlEvidence.version} + 1`,
      }).where(and(eq(controlEvidence.tenantId, input.context.tenantId), eq(controlEvidence.id, input.evidence.evidenceId), eq(controlEvidence.version, evidenceRow.version)));
      if (input.receipt.status === "VERIFIED") {
        const [claim] = await database.select({ canonicalPayload: claims.canonicalPayload, state: claims.state, version: claims.version }).from(claims).where(and(eq(claims.tenantId, input.context.tenantId), eq(claims.id, input.context.claimId))).for("update").limit(1);
        if (claim === undefined || (claim.state !== "ELIGIBLE" && claim.state !== "CONTROLLED")) throw new Error("Claim is not eligible for control verification.");
        if (claim.state === "ELIGIBLE") await database.update(claims).set({ canonicalPayload: { ...asObject(claim.canonicalPayload), state: "CONTROLLED", updatedAt: now.toISOString(), version: claim.version + 1 }, state: "CONTROLLED", updatedAt: now, version: claim.version + 1 }).where(and(eq(claims.tenantId, input.context.tenantId), eq(claims.id, input.context.claimId), eq(claims.version, claim.version)));
      }
      await database.insert(operationSteps).values({ id: this.nextId(), tenantId: input.context.tenantId, operationId: idempotency.resourceId, name: "FINALIZE_EVIDENCE", status: "SUCCEEDED", attemptCount: 1, safeResult: metadata, createdAt: now, updatedAt: now });
      await database.insert(auditEvents).values({ id: this.nextId(), tenantId: input.context.tenantId, actorId: input.context.actorId, requestId: input.context.requestId, correlationId: input.context.correlationId, idempotencyKey: input.context.idempotencyKey, action: "control.evidence.lifecycle.attached", resourceType: "CONTROL_EVIDENCE", resourceId: input.evidence.evidenceId, payloadHash: input.evidence.sha256, result: "SUCCESS", references: { evidenceVersion: input.evidence.version, receiptHash: input.receipt.receiptHash, sandbox: true, status: input.receipt.status }, createdAt: now });
      await database.insert(outboxEvents).values({ id: this.nextId(), tenantId: input.context.tenantId, aggregateType: "CONTROL_EVIDENCE", aggregateId: input.evidence.evidenceId, aggregateVersion: evidenceRow.version + 1, eventType: "control.evidence.lifecycle.attached", eventVersion: 1, idempotencyKey: `${input.context.idempotencyKey}:lifecycle`, correlationId: input.context.correlationId, payload: { evidenceHash: input.evidence.sha256, evidenceVersion: input.evidence.version, receiptHash: input.receipt.receiptHash, sandbox: true, status: input.receipt.status }, createdAt: now, nextAttemptAt: now }).onConflictDoNothing();
    });
  }
}

function asObject(value: unknown): Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
