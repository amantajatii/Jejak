import { and, eq, gt, inArray, isNotNull, isNull, or } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";

import type { JejakDatabase } from "../../../db/client.js";
import { withTenantTransaction } from "../../../db/context.js";
import { claims, controlEvidence, eligibilityAttestations, facilityPositions, financingOffers } from "../../../db/schema/domain.js";
import { chainReconciliationExpectations } from "../../../db/schema/chain.js";
import { auditEvents, chainSubmissions, idempotencyRecords, operationSteps, operations, outboxEvents, partnerAttempts } from "../../../db/schema/reliability.js";
import { canonicalHash } from "../../../reliability/canonical-json.js";
import { chainActionRequestHash } from "../domain/chain-receipt.js";
import { FundingSagaError } from "../domain/errors.js";
import type { ChainActionReceipt, ChainActionRequest, FundingSagaContext, FundingSagaRecord, FundingSagaResult, FundingSagaStatus, FundingStepName } from "../domain/types.js";
import type { BeginFundingDecision, FundingSagaRepository } from "../ports/funding-saga-repository.js";

export class PostgresFundingSagaRepository implements FundingSagaRepository {
  constructor(private readonly database: JejakDatabase, private readonly nextId: () => string = uuidv7, private readonly now: () => Date = () => new Date()) {}

  begin(context: FundingSagaContext, payloadHash: string): Promise<BeginFundingDecision> {
    return withTenantTransaction(this.database, context, async (database) => {
      const operationRecordId = this.nextId();
      const [created] = await database.insert(idempotencyRecords).values({ id: this.nextId(), tenantId: context.tenantId, actorId: context.actorId, operationId: context.operationId, idempotencyKey: context.idempotencyKey, payloadHash, resourceType: "FACILITY_FUNDING", resourceId: operationRecordId, expiresAt: new Date(this.now().getTime() + 86_400_000) }).onConflictDoNothing().returning();
      if (created !== undefined) {
        await database.insert(operations).values({ id: operationRecordId, tenantId: context.tenantId, kind: "FACILITY_FUNDING", status: "PENDING", resourceType: "CLAIM", resourceId: context.claimId, correlationId: context.correlationId, context: safeContext(context), createdAt: this.now(), updatedAt: this.now() });
        return { kind: "NEW", record: { operationRecordId, status: "PENDING", steps: {} } };
      }
      const [existing] = await database.select({ payloadHash: idempotencyRecords.payloadHash, resourceId: idempotencyRecords.resourceId, responseBody: idempotencyRecords.responseBody }).from(idempotencyRecords).where(idempotencyScope(context)).limit(1);
      if (existing === undefined || existing.payloadHash !== payloadHash || existing.resourceId === null) return { kind: "CONFLICT" };
      if (isFundingResult(existing.responseBody)) return { kind: "REPLAY", result: existing.responseBody };
      return { kind: "RESUME", record: await loadRecord(database, context.tenantId, existing.resourceId) };
    });
  }

  load(context: FundingSagaContext, operationRecordId: string): Promise<FundingSagaRecord> { return withTenantTransaction(this.database, context, (database) => loadRecord(database, context.tenantId, operationRecordId)); }

  ensurePreconditions(context: FundingSagaContext, operationRecordId: string): Promise<void> {
    return withTenantTransaction(this.database, context, async (database) => {
      const now = this.now();
      const [claim] = await database.select({ state: claims.state, version: claims.version }).from(claims).where(and(eq(claims.tenantId, context.tenantId), eq(claims.id, context.claimId))).limit(1);
      if (claim === undefined || !["CONTROLLED", "ISSUED"].includes(claim.state) || claim.version !== context.expectedClaimVersion) {
        throw new FundingSagaError("INVALID_STATE_TRANSITION", "Claim must be CONTROLLED or ISSUED at the expected version.");
      }
      const [evidence] = await database.select({ id: controlEvidence.id }).from(controlEvidence).where(and(eq(controlEvidence.tenantId, context.tenantId), eq(controlEvidence.claimId, context.claimId), eq(controlEvidence.status, "VERIFIED"), isNotNull(controlEvidence.documentSecretRef), or(isNull(controlEvidence.expiresAt), gt(controlEvidence.expiresAt, now)))).limit(1);
      if (evidence === undefined) throw new FundingSagaError("INVALID_STATE_TRANSITION", "Verified control evidence is required.");
      const [attestation] = await database.select({ id: eligibilityAttestations.id }).from(eligibilityAttestations).where(and(eq(eligibilityAttestations.tenantId, context.tenantId), eq(eligibilityAttestations.claimId, context.claimId), eq(eligibilityAttestations.status, "ACTIVE"), gt(eligibilityAttestations.expiresAt, now))).limit(1);
      if (attestation === undefined) throw new FundingSagaError("INVALID_STATE_TRANSITION", "An active eligibility attestation is required.");
      const [offer] = await database.select().from(financingOffers).where(and(eq(financingOffers.tenantId, context.tenantId), eq(financingOffers.id, context.offerId), eq(financingOffers.claimId, context.claimId), eq(financingOffers.status, "ACCEPTED"), gt(financingOffers.expiresAt, now))).limit(1);
      const termsHash = financingOfferTermsHash(offer?.canonicalPayload);
      if (
        offer === undefined || offer.principalCurrency !== context.source.currency || offer.principalScale !== context.source.scale ||
        (offer.principalIssuer ?? undefined) !== context.source.issuer || termsHash !== context.chainIntent.acceptedTermsHash ||
        BigInt(context.source.amountMinor) > BigInt(offer.principalAmountMinor)
      ) throw new FundingSagaError("VALIDATION_FAILED", "Requested maximum amount exceeds accepted offer terms.");
      const [position] = await database.select({ id: facilityPositions.id }).from(facilityPositions).where(and(eq(facilityPositions.tenantId, context.tenantId), eq(facilityPositions.claimId, context.claimId), inArray(facilityPositions.status, ["ACTIVE", "PENDING", "PAUSED"]))).limit(1);
      if (position !== undefined) throw new FundingSagaError("INVALID_STATE_TRANSITION", "Claim already has an active facility position.");
      await upsertStep(database, this.nextId, now, context.tenantId, operationRecordId, "PRECONDITIONS", "SUCCEEDED", { claimVersion: claim.version, evidenceId: evidence.id, offerId: offer.id });
      if (claim.state === "ISSUED") {
        await upsertStep(database, this.nextId, now, context.tenantId, operationRecordId, "ASSET_ISSUANCE", "SUCCEEDED", {
          source: "CANONICAL_CLAIM_STATE",
        });
      }
    });
  }

  recordStep(input: Parameters<FundingSagaRepository["recordStep"]>[0]): Promise<void> { return withTenantTransaction(this.database, input.context, (database) => upsertStep(database, this.nextId, this.now(), input.context.tenantId, input.operationRecordId, input.step, input.status, input.safeResult)); }

  commitIssuer(input: Parameters<FundingSagaRepository["commitIssuer"]>[0]): Promise<void> {
    return withTenantTransaction(this.database, input.context, async (database) => {
      const status = input.receipt.approved ? "SUCCEEDED" : input.receipt.status === "PENDING" || input.receipt.status === "ACTION_REQUIRED" ? "WAITING" : "FAILED";
      await upsertStep(database, this.nextId, this.now(), input.context.tenantId, input.operationRecordId, "ISSUER_APPROVAL", status, { receipt: input.receipt });
      await database.insert(partnerAttempts).values({ id: this.nextId(), tenantId: input.context.tenantId, operationId: input.operationRecordId, partner: "ISSUER_SANDBOX", operation: "facilityFundingIssuerApproval", requestHash: input.receipt.requestHash, status, startedAt: this.now(), completedAt: this.now() });
    });
  }

  prepareChain(input: Parameters<FundingSagaRepository["prepareChain"]>[0]): Promise<{ receipt?: ChainActionReceipt; submissionId: string }> {
    return withTenantTransaction(this.database, input.context, async (database) => {
      const [existing] = await database.select().from(chainSubmissions).where(and(eq(chainSubmissions.tenantId, input.context.tenantId), eq(chainSubmissions.operationId, input.operationRecordId), eq(chainSubmissions.idempotencyKey, input.request.idempotencyKey))).limit(1);
      if (existing !== undefined) return {
        submissionId: existing.id,
        ...(["CHAIN_SUCCESS_PENDING_RECONCILIATION", "RECONCILED", "SUBMITTED"].includes(existing.status) && existing.transactionHash !== null
          ? { receipt: reconstructReceipt(input.request, existing.transactionHash, existing.ledgerSequence ?? undefined) }
          : {}),
      };
      const id = this.nextId();
      await database.insert(chainSubmissions).values({ id, tenantId: input.context.tenantId, operationId: input.operationRecordId, network: input.request.network, idempotencyKey: input.request.idempotencyKey, envelopeHash: input.request.envelopeHash, status: "PENDING", createdAt: this.now(), updatedAt: this.now() });
      return { submissionId: id };
    });
  }

  commitChain(input: Parameters<FundingSagaRepository["commitChain"]>[0]): Promise<void> {
    return withTenantTransaction(this.database, input.context, async (database) => {
      const now = this.now();
      await database.update(chainSubmissions).set({ status: "SUBMITTED", transactionHash: input.receipt.transactionHash, ledgerSequence: input.receipt.ledgerSequence ?? null, updatedAt: now }).where(and(eq(chainSubmissions.tenantId, input.context.tenantId), eq(chainSubmissions.id, input.submissionId)));
      const step: FundingStepName = input.receipt.action === "ISSUE" ? "ASSET_ISSUANCE" : input.receipt.action === "COMPENSATE" ? "COMPENSATION" : "FACILITY_FUNDING";
      await upsertStep(database, this.nextId, now, input.context.tenantId, input.operationRecordId, step, "WAITING", safeChainReceipt(input.receipt));
      if (input.receipt.action === "ISSUE_AND_FUND") await upsertStep(database, this.nextId, now, input.context.tenantId, input.operationRecordId, "ASSET_ISSUANCE", "WAITING", safeChainReceipt(input.receipt));
      await database.insert(chainReconciliationExpectations).values({
        id: this.nextId(), tenantId: input.context.tenantId, chainSubmissionId: input.submissionId,
        claimKey: input.context.chainIntent.claimKey,
        expectedAmount: input.context.source.amountMinor,
        expectedClaimState: expectedState(input.receipt.action),
        expectedEventType: expectedEvent(input.receipt.action),
        ...(input.receipt.action === "ISSUE" ? { approvedPrincipalBaseUnits: input.context.source.amountMinor } : {}),
      }).onConflictDoNothing();
    });
  }

  commitAnchor(input: Parameters<FundingSagaRepository["commitAnchor"]>[0]): Promise<void> { return this.recordStep({ context: input.context, operationRecordId: input.operationRecordId, step: "ANCHOR_PAYOUT", status: "SUCCEEDED", safeResult: { receipt: input.receipt } }); }

  markStatus(context: FundingSagaContext, operationRecordId: string, status: FundingSagaStatus, reason?: string): Promise<void> {
    return withTenantTransaction(this.database, context, async (database) => { const now = this.now(); await database.update(operations).set({ status, updatedAt: now }).where(and(eq(operations.tenantId, context.tenantId), eq(operations.id, operationRecordId))); if (status === "PAUSED" || status === "COMPENSATION_REQUIRED") await updateClaimState(database, context, "PAUSED", now); await writeAudit(database, this.nextId(), now, context, operationRecordId, `facility.funding.${status.toLowerCase()}`, status, reason); });
  }

  markCompensationRequired(context: FundingSagaContext, operationRecordId: string, reason: string): Promise<void> { return this.markStatus(context, operationRecordId, "COMPENSATION_REQUIRED", reason); }

  markCompensated(context: FundingSagaContext, operationRecordId: string, receipt: ChainActionReceipt): Promise<void> {
    return withTenantTransaction(this.database, context, async (database) => { const now = this.now(); await updateClaimState(database, context, "CONTROLLED", now); const result: FundingSagaResult = { operationRecordId, sandbox: true, status: "COMPENSATED" }; await finish(database, this.nextId, now, context, operationRecordId, result, receipt.receiptHash, "facility.funding.compensated"); });
  }

  complete(input: Parameters<FundingSagaRepository["complete"]>[0]): Promise<FundingSagaResult> { return withTenantTransaction(this.database, input.context, async (database) => { await finish(database, this.nextId, this.now(), input.context, input.operationRecordId, input.result, undefined, "facility.funding.completed"); return input.result; }); }

  recordChainReconciliation(input: Parameters<FundingSagaRepository["recordChainReconciliation"]>[0]): Promise<FundingSagaRecord> {
    return withTenantTransaction(this.database, input.context, async (database) => {
      const now = this.now();
      const [submission] = await database.select({ id: chainSubmissions.id }).from(chainSubmissions).where(and(
        eq(chainSubmissions.tenantId, input.context.tenantId), eq(chainSubmissions.operationId, input.operationRecordId),
        eq(chainSubmissions.transactionHash, input.reconciliation.transactionHash), eq(chainSubmissions.status, "SUBMITTED"),
      )).limit(1);
      if (submission === undefined) throw new FundingSagaError("PARTNER_REJECTED", "Canonical reconciliation does not match a submitted chain transaction.");
      const step = stepForAction(input.reconciliation.action);
      if (input.reconciliation.outcome === "MISMATCH") {
        await upsertStep(database, this.nextId, now, input.context.tenantId, input.operationRecordId, step, "FAILED", safeReconciliation(input.reconciliation));
        await database.update(operations).set({ status: "FAILED", updatedAt: now }).where(and(eq(operations.tenantId, input.context.tenantId), eq(operations.id, input.operationRecordId)));
        await writeAudit(database, this.nextId(), now, input.context, input.operationRecordId, "facility.funding.chain_mismatch", "FAILED", input.reconciliation.canonicalEventId);
        return loadRecord(database, input.context.tenantId, input.operationRecordId);
      }
      await upsertStep(database, this.nextId, now, input.context.tenantId, input.operationRecordId, step, "SUCCEEDED", safeReconciliation(input.reconciliation));
      if (input.reconciliation.action === "ISSUE_AND_FUND") await upsertStep(database, this.nextId, now, input.context.tenantId, input.operationRecordId, "ASSET_ISSUANCE", "SUCCEEDED", safeReconciliation(input.reconciliation));
      if (input.reconciliation.action === "COMPENSATE") {
        await updateClaimState(database, input.context, "CONTROLLED", now);
        const result: FundingSagaResult = { operationRecordId: input.operationRecordId, sandbox: true, status: "COMPENSATED" };
        await finish(database, this.nextId, now, input.context, input.operationRecordId, result, input.reconciliation.transactionHash, "facility.funding.compensated");
      }
      return loadRecord(database, input.context.tenantId, input.operationRecordId);
    });
  }
}

async function loadRecord(database: JejakDatabase, tenantId: string, id: string): Promise<FundingSagaRecord> {
  const [operation] = await database.select({ status: operations.status }).from(operations).where(and(eq(operations.tenantId, tenantId), eq(operations.id, id))).limit(1);
  if (operation === undefined) throw new Error("Funding operation was not found.");
  const rows = await database.select().from(operationSteps).where(and(eq(operationSteps.tenantId, tenantId), eq(operationSteps.operationId, id)));
  const steps: FundingSagaRecord["steps"] = {};
  for (const row of rows) if (isStep(row.name)) steps[row.name] = { name: row.name, status: row.status as "PENDING" | "SUCCEEDED" | "WAITING" | "FAILED", attemptCount: row.attemptCount, ...(row.safeResult === null ? {} : { safeResult: row.safeResult as Record<string, unknown> }) };
  return { operationRecordId: id, status: operation.status as FundingSagaStatus, steps };
}

async function upsertStep(database: JejakDatabase, nextId: () => string, now: Date, tenantId: string, operationId: string, name: FundingStepName, status: string, safeResult?: Record<string, unknown>): Promise<void> {
  await database.select({ id: operations.id }).from(operations).where(and(eq(operations.tenantId, tenantId), eq(operations.id, operationId))).for("update").limit(1);
  const [prior] = await database.select({ id: operationSteps.id, attemptCount: operationSteps.attemptCount }).from(operationSteps).where(and(eq(operationSteps.tenantId, tenantId), eq(operationSteps.operationId, operationId), eq(operationSteps.name, name))).limit(1);
  if (prior === undefined) await database.insert(operationSteps).values({ id: nextId(), tenantId, operationId, name, status, attemptCount: 1, ...(safeResult === undefined ? {} : { safeResult }), createdAt: now, updatedAt: now });
  else await database.update(operationSteps).set({ status, attemptCount: prior.attemptCount + 1, ...(safeResult === undefined ? {} : { safeResult }), updatedAt: now }).where(and(eq(operationSteps.tenantId, tenantId), eq(operationSteps.id, prior.id)));
}

async function updateClaimState(database: JejakDatabase, context: FundingSagaContext, state: string, now: Date): Promise<void> {
  const [claim] = await database.select({ canonicalPayload: claims.canonicalPayload, state: claims.state, version: claims.version }).from(claims).where(and(eq(claims.tenantId, context.tenantId), eq(claims.id, context.claimId))).limit(1);
  if (claim === undefined || claim.state === state) return;
  await database.update(claims).set({ canonicalPayload: { ...asObject(claim.canonicalPayload), state, updatedAt: now.toISOString(), version: claim.version + 1 }, state, version: claim.version + 1, updatedAt: now }).where(and(eq(claims.tenantId, context.tenantId), eq(claims.id, context.claimId), eq(claims.version, claim.version)));
}

async function finish(database: JejakDatabase, nextId: () => string, now: Date, context: FundingSagaContext, operationId: string, result: FundingSagaResult, receiptHash: string | undefined, eventType: string): Promise<void> {
  await database.update(operations).set({ status: result.status, updatedAt: now }).where(and(eq(operations.tenantId, context.tenantId), eq(operations.id, operationId)));
  await database.update(idempotencyRecords).set({ responseBody: result, responseHash: canonicalHash(result), responseStatus: 200, completedAt: now }).where(idempotencyScope(context));
  await writeAudit(database, nextId(), now, context, operationId, eventType, "SUCCESS", receiptHash);
  await database.insert(outboxEvents).values({ id: nextId(), tenantId: context.tenantId, aggregateType: "FACILITY_POSITION", aggregateId: context.facilityPositionId, aggregateVersion: 1, eventType, eventVersion: 1, idempotencyKey: `${context.idempotencyKey}:${result.status}`, correlationId: context.correlationId, payload: { claimId: context.claimId, operationId, ...(receiptHash === undefined ? {} : { receiptHash }), sandbox: true, status: result.status }, createdAt: now, nextAttemptAt: now }).onConflictDoNothing();
}

async function writeAudit(database: JejakDatabase, id: string, now: Date, context: FundingSagaContext, operationId: string, action: string, result: string, reason?: string): Promise<void> { await database.insert(auditEvents).values({ id, tenantId: context.tenantId, actorId: context.actorId, requestId: context.requestId, correlationId: context.correlationId, idempotencyKey: context.idempotencyKey, action, resourceType: "FACILITY_FUNDING", resourceId: context.claimId, result, ...(reason === undefined ? {} : { reasonCode: reason }), references: { operationId, sandbox: true }, createdAt: now }); }

function reconstructReceipt(request: ChainActionRequest, transactionHash: string, ledgerSequence: number | undefined): ChainActionReceipt { const unsigned = { action: request.action, envelopeHash: request.envelopeHash, ...(ledgerSequence === undefined ? {} : { ledgerSequence }), network: request.network, requestHash: chainActionRequestHash(request), sandbox: true, status: "SUBMITTED" as const, transactionHash }; return { ...unsigned, receiptHash: canonicalHash(unsigned) }; }
function safeChainReceipt(receipt: ChainActionReceipt) { return { action: receipt.action, envelopeHash: receipt.envelopeHash, ledgerSequence: receipt.ledgerSequence, network: receipt.network, receiptHash: receipt.receiptHash, requestHash: receipt.requestHash, sandbox: true, status: receipt.status, transactionHash: receipt.transactionHash }; }
function safeContext(context: FundingSagaContext) { return { chainMode: context.chainMode, claimId: context.claimId, facilityPositionId: context.facilityPositionId, network: context.network, offerId: context.offerId, sandbox: true, source: context.source }; }
function idempotencyScope(context: FundingSagaContext) { return and(eq(idempotencyRecords.tenantId, context.tenantId), eq(idempotencyRecords.actorId, context.actorId), eq(idempotencyRecords.operationId, context.operationId), eq(idempotencyRecords.idempotencyKey, context.idempotencyKey)); }
function isFundingResult(value: unknown): value is FundingSagaResult { return typeof value === "object" && value !== null && "operationRecordId" in value && "status" in value && "sandbox" in value; }
function isStep(value: string): value is FundingStepName { return ["PRECONDITIONS", "ISSUER_APPROVAL", "ASSET_ISSUANCE", "FACILITY_FUNDING", "ANCHOR_PAYOUT", "COMPENSATION"].includes(value); }
function asObject(value: unknown): Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
type FinancingOfferPayload = { termsHash: string };
function financingOfferTermsHash(value: unknown): string | undefined {
  const termsHash = asObject(value).termsHash;
  return typeof termsHash === "string" && /^[a-f0-9]{64}$/i.test(termsHash) ? termsHash : undefined;
}
function expectedEvent(action: ChainActionReceipt["action"]): string { return action === "ISSUE" ? "asset.issued" : action === "COMPENSATE" ? "asset.redeemed" : "position.funded"; }
function expectedState(action: ChainActionReceipt["action"]): string { return action === "ISSUE" ? "ISSUED" : action === "COMPENSATE" ? "CONTROLLED" : "FUNDED"; }
function stepForAction(action: import("../domain/types.js").FundingChainAction): FundingStepName { return action === "ISSUE" ? "ASSET_ISSUANCE" : action === "COMPENSATE" ? "COMPENSATION" : "FACILITY_FUNDING"; }
function safeReconciliation(value: import("../domain/types.js").FundingChainReconciliation) { return { canonicalEventId: value.canonicalEventId, ledgerSequence: value.ledgerSequence, outcome: value.outcome, transactionHash: value.transactionHash }; }
