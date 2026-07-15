import { and, desc, eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";

import type { JejakDatabase } from "../../../db/client.js";
import { applyTransactionContext } from "../../../db/context.js";
import { auditEvents, claims, idempotencyRecords, outboxEvents, resolutionCases, waterfallResults } from "../../../db/schema/index.js";
import { IdempotencyConflictError } from "../../../reliability/mutation-coordinator.js";
import { DomainError, validationError } from "../../shared/errors.js";
import type { ResolutionCaseView, ResolutionRepository } from "../application/resolution-service.js";
import { assertResolutionTransition, type ResolutionMoney } from "../domain/resolution.js";

type Json = Record<string, unknown>;

export class PostgresResolutionRepository implements ResolutionRepository {
  constructor(private readonly database: JejakDatabase, private readonly options: { resolverAddress: string; nextId?: () => string; now?: () => Date }) {}

  load(input: Parameters<ResolutionRepository["load"]>[0]) {
    return this.database.transaction(async (transaction) => {
      const database = transaction as JejakDatabase;
      await applyTransactionContext(database, input.context);
      const [claim] = await database.select({ state: claims.state, version: claims.version }).from(claims).where(and(eq(claims.tenantId, input.context.tenantId), eq(claims.id, input.claimId))).limit(1);
      if (claim === undefined) return undefined;
      const [resolution] = await database.select({ payload: resolutionCases.canonicalPayload }).from(resolutionCases).where(and(eq(resolutionCases.tenantId, input.context.tenantId), eq(resolutionCases.claimId, input.claimId))).orderBy(desc(resolutionCases.updatedAt), desc(resolutionCases.id)).limit(1);
      return { claimState: claim.state, claimVersion: claim.version, ...(resolution === undefined ? {} : { case: resolutionView(resolution.payload) }) };
    });
  }

  mutate(input: Parameters<ResolutionRepository["mutate"]>[0]): Promise<ResolutionCaseView> {
    return this.database.transaction(async (transaction) => {
      const database = transaction as JejakDatabase;
      await applyTransactionContext(database, input.context);
      const replay = await this.#idempotency(database, input);
      if (replay !== undefined) return replay;
      const [claim] = await database.select().from(claims).where(and(eq(claims.tenantId, input.context.tenantId), eq(claims.id, input.claimId))).limit(1).for("update");
      if (claim === undefined) throw new DomainError("INVALID_STATE_TRANSITION", "Claim was not found in the selected tenant.");
      const [caseRow] = await database.select().from(resolutionCases).where(and(eq(resolutionCases.tenantId, input.context.tenantId), eq(resolutionCases.claimId, input.claimId))).orderBy(desc(resolutionCases.updatedAt), desc(resolutionCases.id)).limit(1).for("update");
      assertResolutionTransition({
        action: input.action,
        ...(caseRow === undefined ? {} : { caseStatus: resolutionView(caseRow.canonicalPayload).status }),
        claimState: claim.state,
        claimVersion: claim.version,
        expectedVersion: input.expectedVersion,
        ...(input.recoveryRealized === undefined ? {} : { recoveryRealized: input.recoveryRealized }),
      });
      const now = this.#now();
      let resolution: ResolutionCaseView;
      if (input.action === "OPEN") {
        const exposure = await lossExposure(database, input.context.tenantId, input.claimId, claim.canonicalPayload);
        resolution = {
          claimId: input.claimId,
          evidenceHashes: [...input.evidenceHashes],
          finalLoss: zero(exposure.expected),
          id: this.#id(),
          openedAt: now.toISOString(),
          openedReasonCodes: [...input.reasonCodes],
          recoveryExpected: exposure.expected,
          recoveryRealized: zero(exposure.expected),
          resolverAddress: this.options.resolverAddress,
          status: "OPEN",
          version: 1,
        };
        await database.insert(resolutionCases).values({
          canonicalPayload: { ...resolution, seniorLossExposure: exposure.senior }, claimId: input.claimId, evidenceHashes: resolution.evidenceHashes, id: resolution.id,
          reasonCode: input.reasonCodes[0]!, resolverMembershipId: input.context.membershipId, status: resolution.status, tenantId: input.context.tenantId,
        });
      } else {
        if (caseRow === undefined) throw new DomainError("INVALID_STATE_TRANSITION", "An open resolution case is required.");
        const previous = resolutionView(caseRow.canonicalPayload);
        const realized = input.recoveryRealized ?? previous.recoveryRealized;
        sameUnit(realized, previous.recoveryExpected);
        if (BigInt(realized.amountMinor) < BigInt(previous.recoveryRealized.amountMinor) || BigInt(realized.amountMinor) > BigInt(previous.recoveryExpected.amountMinor)) {
          validationError("Recovery must be monotonic and cannot exceed expected recovery.");
        }
        const seniorLossExposure = resolutionMoney(object(caseRow.canonicalPayload).seniorLossExposure ?? previous.recoveryExpected);
        const finalLoss = subtractFloor(seniorLossExposure, realized);
        resolution = {
          ...previous,
          evidenceHashes: [...new Set([...previous.evidenceHashes, ...input.evidenceHashes])],
          finalLoss: input.action === "CLOSE" ? finalLoss : previous.finalLoss,
          recoveryRealized: realized,
          status: input.action === "CLOSE" ? (BigInt(finalLoss.amountMinor) > 0n ? "WRITTEN_OFF" : "SETTLED") : "RECOVERING",
          ...(input.action === "CLOSE" ? { closedAt: now.toISOString() } : {}),
          version: caseRow.version + 1,
        };
        await database.update(resolutionCases).set({ canonicalPayload: resolution, evidenceHashes: resolution.evidenceHashes, status: resolution.status, updatedAt: now, version: resolution.version }).where(and(
          eq(resolutionCases.tenantId, input.context.tenantId), eq(resolutionCases.id, caseRow.id), eq(resolutionCases.version, caseRow.version),
        ));
      }
      const terminalState = input.action === "CLOSE" ? (BigInt(resolution.finalLoss.amountMinor) > 0n ? "CLOSED_WITH_LOSS" : "CLOSED") : "RESOLUTION";
      await database.update(claims).set({
        canonicalPayload: { ...object(claim.canonicalPayload), state: terminalState, stateReasonCodes: input.reasonCodes, updatedAt: now.toISOString(), version: claim.version + 1 },
        state: terminalState, updatedAt: now, version: claim.version + 1,
      }).where(and(eq(claims.tenantId, input.context.tenantId), eq(claims.id, input.claimId), eq(claims.version, claim.version)));
      const action = input.action === "OPEN" ? "resolution.opened" : input.action === "UPDATE" ? "recovery.recorded" : "resolution.closed";
      await database.insert(auditEvents).values({
        action, actorId: input.context.actorId, afterVersion: claim.version + 1, beforeVersion: claim.version, createdAt: now, id: this.#id(),
        idempotencyKey: input.context.idempotencyKey, membershipId: input.context.membershipId, payloadHash: input.payloadHash,
        reasonCode: input.reasonCodes[0], references: { claimId: input.claimId, finalLoss: resolution.finalLoss.amountMinor, resolutionId: resolution.id },
        requestId: input.context.requestId, resourceId: resolution.id, resourceType: "RESOLUTION", result: "SUCCESS",
        roleGrantId: input.context.roleGrantId, tenantId: input.context.tenantId,
      });
      await database.insert(outboxEvents).values({
        aggregateId: resolution.id, aggregateType: "RESOLUTION", aggregateVersion: resolution.version, createdAt: now, eventType: action,
        id: this.#id(), idempotencyKey: input.context.idempotencyKey, nextAttemptAt: now,
        payload: { claimId: input.claimId, finalLoss: resolution.finalLoss, recoveryRealized: resolution.recoveryRealized, status: resolution.status }, tenantId: input.context.tenantId,
      });
      await database.update(idempotencyRecords).set({ completedAt: now, resourceId: resolution.id, resourceType: "RESOLUTION", responseBody: resolution, responseStatus: 200 }).where(and(
        eq(idempotencyRecords.tenantId, input.context.tenantId), eq(idempotencyRecords.actorId, input.context.actorId),
        eq(idempotencyRecords.operationId, "resolveClaim"), eq(idempotencyRecords.idempotencyKey, input.context.idempotencyKey),
      ));
      return resolution;
    });
  }

  async #idempotency(database: JejakDatabase, input: Parameters<ResolutionRepository["mutate"]>[0]): Promise<ResolutionCaseView | undefined> {
    const [row] = await database.select().from(idempotencyRecords).where(and(
      eq(idempotencyRecords.tenantId, input.context.tenantId), eq(idempotencyRecords.actorId, input.context.actorId),
      eq(idempotencyRecords.operationId, "resolveClaim"), eq(idempotencyRecords.idempotencyKey, input.context.idempotencyKey),
    )).limit(1).for("update");
    if (row !== undefined) {
      if (row.payloadHash !== input.payloadHash) throw new IdempotencyConflictError();
      if (row.responseBody !== null) return resolutionView(row.responseBody);
      throw new DomainError("INVALID_STATE_TRANSITION", "Resolution command is still processing.");
    }
    await database.insert(idempotencyRecords).values({
      actorId: input.context.actorId, expiresAt: new Date(this.#now().getTime() + 86_400_000), id: this.#id(),
      idempotencyKey: input.context.idempotencyKey, operationId: "resolveClaim", payloadHash: input.payloadHash, tenantId: input.context.tenantId,
    });
    return undefined;
  }
  #id() { return (this.options.nextId ?? uuidv7)(); }
  #now() { return (this.options.now ?? (() => new Date()))(); }
}

async function lossExposure(database: JejakDatabase, tenantId: string, claimId: string, claimPayload: unknown): Promise<{ expected: ResolutionMoney; senior: ResolutionMoney }> {
  const [row] = await database.select({ allocation: waterfallResults.allocationPayload }).from(waterfallResults).where(and(eq(waterfallResults.tenantId, tenantId), eq(waterfallResults.claimId, claimId))).orderBy(desc(waterfallResults.createdAt), desc(waterfallResults.id)).limit(1);
  if (row !== undefined) {
    const allocation = object(row.allocation);
    const senior = resolutionMoney(allocation.seniorLoss);
    const first = resolutionMoney(allocation.firstLossApplied);
    sameUnit(senior, first);
    return { expected: { ...senior, amountMinor: (BigInt(senior.amountMinor) + BigInt(first.amountMinor)).toString() }, senior };
  }
  const payload = object(claimPayload);
  const expected = resolutionMoney(payload.outstandingPrincipal);
  return { expected, senior: expected };
}

function resolutionView(value: unknown): ResolutionCaseView {
  const item = object(value);
  if (typeof item.id !== "string" || typeof item.claimId !== "string" || typeof item.status !== "string" || typeof item.version !== "number") throw new Error("Persisted resolution case is malformed.");
  return item as ResolutionCaseView;
}
function resolutionMoney(value: unknown): ResolutionMoney {
  const item = object(value);
  if (typeof item.amountMinor !== "string" || !/^(0|[1-9][0-9]*)$/.test(item.amountMinor) || typeof item.currency !== "string" || typeof item.scale !== "number") throw new Error("Persisted resolution money is malformed.");
  return { amountMinor: item.amountMinor, currency: item.currency, scale: item.scale, ...(typeof item.issuer === "string" ? { issuer: item.issuer } : {}) };
}
function sameUnit(left: ResolutionMoney, right: ResolutionMoney) { if (left.currency !== right.currency || left.scale !== right.scale || left.issuer !== right.issuer) validationError("Recovery money unit must match the resolution exposure."); }
function subtractFloor(exposure: ResolutionMoney | string, recovered: ResolutionMoney): ResolutionMoney {
  const source = typeof exposure === "string" ? { ...recovered, amountMinor: exposure } : exposure;
  const amount = BigInt(source.amountMinor) - BigInt(recovered.amountMinor);
  return { ...source, amountMinor: (amount < 0n ? 0n : amount).toString() };
}
function zero(unit: ResolutionMoney): ResolutionMoney { return { ...unit, amountMinor: "0" }; }
function object(value: unknown): Json { return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Json : {}; }
