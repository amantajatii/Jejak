import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";

import type { AssetController, ClaimLifecycle } from "@jejak/stellar-client";

import type { JejakDatabase } from "../../../db/client.js";
import { applyTransactionContext } from "../../../db/context.js";
import {
  auditEvents,
  chainEvents,
  chainReconciliationExpectations,
  chainSubmissions,
  claims,
  controlEvidence,
  eligibilityAttestations,
  financingOffers,
  idempotencyRecords,
  operations,
  outboxEvents,
} from "../../../db/schema/index.js";
import { canonicalHash } from "../../../reliability/canonical-json.js";
import { IdempotencyConflictError } from "../../../reliability/mutation-coordinator.js";
import type { NodeRoleSigner } from "../../../runtime/stellar/node-role-signer.js";
import type { PromotedTestnetManifest } from "../../../runtime/stellar/manifest.js";
import { DomainError } from "../../shared/errors.js";
import type { IssuerApprovalReceipt, IssuerOperationContext } from "../domain/types.js";
import type { IssuerIssueRouteActor } from "../routes.js";

type ClaimLifecycleClient = Pick<ClaimLifecycle.Client, "confirm_control" | "create_claim" | "get_claim">;
type AssetControllerClient = Pick<AssetController.Client, "issue">;

type Facts = {
  approvedPrincipal: string;
  attestationExpiresAt: Date;
  attestationKey: string;
  claimKey: string;
  controlEvidenceHash: string;
  controlExpiresAt: Date;
  grossAmount: string;
  sourceCurrencyHash: string;
  sellerSubjectHash: string;
};

type BeginResult =
  | { kind: "REPLAY"; receipt: IssuerApprovalReceipt }
  | { kind: "RUN"; operationRecordId: string };

/**
 * TESTNET issue application: catches the on-chain lifecycle up to CONTROLLED,
 * then issues jCLAIM and persists a canonical reconciliation expectation.
 */
export class PostgresTestnetIssuerIssueService {
  constructor(private readonly dependencies: {
    assetController: AssetControllerClient;
    claimLifecycle: ClaimLifecycleClient;
    database: JejakDatabase;
    issuerSigner: NodeRoleSigner;
    manifest: PromotedTestnetManifest;
    originatorSigner: NodeRoleSigner;
    nextId?: () => string;
    now?: () => Date;
  }) {}

  async buildContext(input: IssuerIssueRouteActor & {
    attestationId: string;
    claimId: string;
    controlEvidenceId: string;
    expectedClaimVersion: number;
  }): Promise<IssuerOperationContext> {
    const facts = await this.#facts(input);
    return {
      actorId: input.actorId,
      aggregateId: input.claimId,
      correlationId: input.correlationId,
      idempotencyKey: input.idempotencyKey,
      operationId: deterministicUuidV7(canonicalHash({
        claimId: input.claimId,
        idempotencyKey: input.idempotencyKey,
        operation: "ISSUE_TESTNET",
        tenantId: input.tenantId,
      })),
      requestId: input.requestId,
      requestedAt: input.requestedAt,
      tenantId: input.tenantId,
      transaction: {
        amountMinor: facts.approvedPrincipal,
        assetCode: "JCLAIM",
        claimId: input.claimId,
        destination: this.dependencies.manifest.roles.treasury_holder,
        envelopeHash: canonicalHash({
          amountMinor: facts.approvedPrincipal,
          attestationKey: facts.attestationKey,
          claimKey: facts.claimKey,
          controlEvidenceHash: facts.controlEvidenceHash,
          operation: "ISSUE",
        }),
        networkPassphrase: this.dependencies.manifest.network.passphrase,
        operation: "ISSUE",
        sequence: String(input.expectedClaimVersion),
        source: this.dependencies.manifest.roles.issuer_operator,
      },
    };
  }

  async execute(context: IssuerOperationContext): Promise<IssuerApprovalReceipt> {
    const payloadHash = canonicalHash({
      aggregateId: context.aggregateId,
      tenantId: context.tenantId,
      transaction: context.transaction,
    });
    const begun = await this.#begin(context, payloadHash);
    if (begun.kind === "REPLAY") return begun.receipt;
    const facts = await this.#facts({
      actorId: context.actorId,
      claimId: context.aggregateId,
      expectedClaimVersion: Number(context.transaction.sequence),
      requestId: context.requestId,
      tenantId: context.tenantId,
    });
    const claimKey = Buffer.from(facts.claimKey, "hex");
    const transactionHashes: string[] = [];

    let state = await this.#onchainState(claimKey);
    if (state === undefined) {
      const created = await this.dependencies.claimLifecycle.create_claim({
        approved_principal_base_units: BigInt(facts.approvedPrincipal),
        attestation_key: Buffer.from(facts.attestationKey, "hex"),
        claim_key: claimKey,
        facility_id: Buffer.from(this.dependencies.manifest.configuration.facilityId, "hex"),
        originator: this.dependencies.manifest.roles.originator_control,
        seller_subject_hash: Buffer.from(facts.sellerSubjectHash, "hex"),
        source_amount: BigInt(facts.grossAmount),
        source_currency_hash: Buffer.from(facts.sourceCurrencyHash, "hex"),
      });
      assertSimulated(created, "create claim");
      transactionHashes.push((await this.dependencies.originatorSigner.submit(created)).transactionHash);
      state = 0;
    }
    if (state === 0) {
      const expiresAt = BigInt(Math.floor(Math.min(
        facts.attestationExpiresAt.getTime(),
        facts.controlExpiresAt.getTime(),
      ) / 1_000));
      const controlled = await this.dependencies.claimLifecycle.confirm_control({
        actor: this.dependencies.manifest.roles.originator_control,
        claim_key: claimKey,
        evidence_hash: Buffer.from(facts.controlEvidenceHash, "hex"),
        expires_at: expiresAt,
      });
      assertSimulated(controlled, "confirm control");
      transactionHashes.push((await this.dependencies.originatorSigner.submit(controlled)).transactionHash);
      state = 1;
    }
    let issueHash: string | undefined;
    let issueLedger: number | undefined;
    if (state === 1) {
      const issued = await this.dependencies.assetController.issue({
        amount: BigInt(facts.approvedPrincipal),
        claim_key: claimKey,
        facility_holder: this.dependencies.manifest.roles.treasury_holder,
        issuer_operator: this.dependencies.manifest.roles.issuer_operator,
      });
      assertSimulated(issued, "issue jCLAIM");
      const receipt = await this.dependencies.issuerSigner.submit(issued);
      issueHash = receipt.transactionHash;
      issueLedger = receipt.ledgerSequence;
      transactionHashes.push(receipt.transactionHash);
    } else if (state === 2) {
      const recovered = await this.#indexedIssue(context.tenantId, facts.claimKey);
      if (recovered === undefined) {
        throw new DomainError("PARTNER_TIMEOUT", "Issued Testnet state is awaiting canonical event indexing.", true);
      }
      issueHash = recovered.transactionHash;
      issueLedger = recovered.ledgerSequence;
      transactionHashes.push(recovered.transactionHash);
    } else {
      throw new DomainError("INVALID_STATE_TRANSITION", "On-chain claim is not eligible for issuance.");
    }

    await this.#recordSubmission({
      context,
      envelopeHash: context.transaction.envelopeHash,
      expectedAmount: facts.approvedPrincipal,
      ...(issueLedger === undefined ? {} : { ledgerSequence: issueLedger }),
      operationRecordId: begun.operationRecordId,
      transactionHash: issueHash,
      transactionHashes,
    });
    const requestHash = canonicalHash({ payloadHash, transactionHash: issueHash });
    const unsigned = {
      adapterMode: "SANDBOX" as const,
      approved: true,
      approvedPayloadHash: payloadHash,
      correlationId: context.correlationId,
      decidedAt: this.#now().toISOString(),
      partnerReference: issueHash,
      reasonCodes: ["STELLAR_TESTNET_SUBMITTED"],
      requestHash,
      sandbox: true,
      status: "APPROVED" as const,
    };
    const receipt: IssuerApprovalReceipt = { ...unsigned, receiptHash: canonicalHash(unsigned) };
    await this.#complete(context, begun.operationRecordId, payloadHash, receipt, transactionHashes);
    return receipt;
  }

  async #facts(input: {
    actorId: string;
    attestationId?: string;
    claimId: string;
    controlEvidenceId?: string;
    expectedClaimVersion: number;
    requestId: string;
    tenantId: string;
  }): Promise<Facts> {
    return this.dependencies.database.transaction(async (transaction) => {
      const database = transaction as JejakDatabase;
      await applyTransactionContext(database, input);
      const [claim] = await database.select().from(claims).where(and(
        eq(claims.tenantId, input.tenantId),
        eq(claims.id, input.claimId),
      )).limit(1);
      if (claim === undefined || claim.state !== "CONTROLLED") {
        throw new DomainError("INVALID_STATE_TRANSITION", "Claim must be CONTROLLED before Testnet issuance.");
      }
      if (claim.version !== input.expectedClaimVersion) {
        throw new DomainError("VERSION_CONFLICT", "Claim version does not match If-Match.");
      }
      const [attestation] = await database.select().from(eligibilityAttestations).where(and(
        eq(eligibilityAttestations.tenantId, input.tenantId),
        eq(eligibilityAttestations.claimId, input.claimId),
        eq(eligibilityAttestations.status, "ACTIVE"),
        ...(input.attestationId === undefined ? [] : [eq(eligibilityAttestations.id, input.attestationId)]),
      )).orderBy(desc(eligibilityAttestations.updatedAt)).limit(1);
      const [evidence] = await database.select().from(controlEvidence).where(and(
        eq(controlEvidence.tenantId, input.tenantId),
        eq(controlEvidence.claimId, input.claimId),
        eq(controlEvidence.status, "VERIFIED"),
        ...(input.controlEvidenceId === undefined ? [] : [eq(controlEvidence.id, input.controlEvidenceId)]),
      )).orderBy(desc(controlEvidence.updatedAt)).limit(1);
      const [offer] = await database.select().from(financingOffers).where(and(
        eq(financingOffers.tenantId, input.tenantId),
        eq(financingOffers.claimId, input.claimId),
        eq(financingOffers.status, "ACCEPTED"),
      )).orderBy(desc(financingOffers.updatedAt)).limit(1);
      if (attestation === undefined || evidence === undefined || offer === undefined) {
        throw new DomainError("INVALID_STATE_TRANSITION", "Active attestation, verified control, and accepted offer are required.");
      }
      const attestationPayload = object(object(attestation.canonicalPayload).envelope);
      const jcc = object(attestationPayload.attestation);
      const attestationKey = hex(jcc.attestationKey, "attestation key");
      if (typeof jcc.claimKey === "string" && jcc.claimKey !== claim.claimKey) {
        throw new DomainError("VALIDATION_FAILED", "JCC claim key does not match the selected claim.");
      }
      const sellerSubjectHash = hex(jcc.sellerSubjectHash, "seller subject hash");
      const controlExpiry = evidence.expiresAt ?? attestation.expiresAt;
      if (attestation.expiresAt <= this.#now() || controlExpiry <= this.#now()) {
        throw new DomainError("VALIDATION_FAILED", "Attestation or control evidence is expired.");
      }
      const claimPayload = object(claim.canonicalPayload);
      const gross = money(claimPayload.grossUnsettled);
      return {
        approvedPrincipal: offer.principalAmountMinor,
        attestationExpiresAt: attestation.expiresAt,
        attestationKey,
        claimKey: hex(claim.claimKey, "claim key"),
        controlEvidenceHash: hex(evidence.evidenceHash, "control evidence hash"),
        controlExpiresAt: controlExpiry,
        grossAmount: gross.amountMinor,
        sellerSubjectHash,
        sourceCurrencyHash: canonicalHash({ currency: gross.currency, issuer: gross.issuer ?? null, scale: gross.scale }),
      };
    });
  }

  async #begin(context: IssuerOperationContext, payloadHash: string): Promise<BeginResult> {
    return this.dependencies.database.transaction(async (transaction) => {
      const database = transaction as JejakDatabase;
      await applyTransactionContext(database, context);
      const [existing] = await database.select().from(idempotencyRecords).where(and(
        eq(idempotencyRecords.tenantId, context.tenantId),
        eq(idempotencyRecords.actorId, context.actorId),
        eq(idempotencyRecords.operationId, "issueClaimTestnet"),
        eq(idempotencyRecords.idempotencyKey, context.idempotencyKey),
      )).limit(1).for("update");
      if (existing !== undefined) {
        if (existing.payloadHash !== payloadHash) throw new IdempotencyConflictError();
        if (isReceipt(existing.responseBody)) return { kind: "REPLAY", receipt: existing.responseBody };
        if (existing.resourceId === null) throw new DomainError("INVALID_STATE_TRANSITION", "Testnet issuance is still preparing.");
        return { kind: "RUN", operationRecordId: existing.resourceId };
      }
      const operationRecordId = context.operationId;
      await database.insert(operations).values({
        context: { claimId: context.aggregateId },
        id: operationRecordId,
        kind: "ASSET_ISSUANCE",
        resourceId: context.aggregateId,
        resourceType: "CLAIM",
        status: "SUBMITTING",
        tenantId: context.tenantId,
      });
      await database.insert(idempotencyRecords).values({
        actorId: context.actorId,
        expiresAt: new Date(this.#now().getTime() + 86_400_000),
        id: this.#id(),
        idempotencyKey: context.idempotencyKey,
        operationId: "issueClaimTestnet",
        payloadHash,
        resourceId: operationRecordId,
        resourceType: "CHAIN_OPERATION",
        tenantId: context.tenantId,
      });
      return { kind: "RUN", operationRecordId };
    });
  }

  async #recordSubmission(input: {
    context: IssuerOperationContext;
    envelopeHash: string;
    expectedAmount: string;
    ledgerSequence?: number;
    operationRecordId: string;
    transactionHash: string;
    transactionHashes: string[];
  }): Promise<void> {
    await this.dependencies.database.transaction(async (transaction) => {
      const database = transaction as JejakDatabase;
      await applyTransactionContext(database, input.context);
      const [existing] = await database.select({ id: chainSubmissions.id }).from(chainSubmissions).where(and(
        eq(chainSubmissions.tenantId, input.context.tenantId),
        eq(chainSubmissions.operationId, input.operationRecordId),
        eq(chainSubmissions.idempotencyKey, `${input.context.idempotencyKey}:asset-issued`),
      )).limit(1);
      if (existing !== undefined) return;
      const submissionId = this.#id();
      await database.insert(chainSubmissions).values({
        envelopeHash: input.envelopeHash,
        id: submissionId,
        idempotencyKey: `${input.context.idempotencyKey}:asset-issued`,
        ...(input.ledgerSequence === undefined ? {} : { ledgerSequence: input.ledgerSequence }),
        network: "testnet",
        operationId: input.operationRecordId,
        status: "CHAIN_SUCCESS_PENDING_RECONCILIATION",
        tenantId: input.context.tenantId,
        transactionHash: input.transactionHash,
      });
      await database.insert(chainReconciliationExpectations).values({
        approvedPrincipalBaseUnits: input.expectedAmount,
        chainSubmissionId: submissionId,
        claimKey: (await this.#claimKey(database, input.context)).claimKey,
        expectedAmount: input.expectedAmount,
        expectedClaimState: "ISSUED",
        expectedEventType: "asset.issued",
        id: this.#id(),
        tenantId: input.context.tenantId,
      });
      await database.update(operations).set({
        context: { claimId: input.context.aggregateId, transactionHashes: input.transactionHashes },
        status: "PENDING_RECONCILIATION",
        updatedAt: this.#now(),
      }).where(and(eq(operations.tenantId, input.context.tenantId), eq(operations.id, input.operationRecordId)));
    });
  }

  async #complete(
    context: IssuerOperationContext,
    operationRecordId: string,
    payloadHash: string,
    receipt: IssuerApprovalReceipt,
    transactionHashes: string[],
  ): Promise<void> {
    await this.dependencies.database.transaction(async (transaction) => {
      const database = transaction as JejakDatabase;
      await applyTransactionContext(database, context);
      const now = this.#now();
      await database.update(idempotencyRecords).set({
        completedAt: now,
        responseBody: receipt,
        responseHash: canonicalHash(receipt),
        responseStatus: 202,
      }).where(and(
        eq(idempotencyRecords.tenantId, context.tenantId),
        eq(idempotencyRecords.actorId, context.actorId),
        eq(idempotencyRecords.operationId, "issueClaimTestnet"),
        eq(idempotencyRecords.idempotencyKey, context.idempotencyKey),
        eq(idempotencyRecords.payloadHash, payloadHash),
      ));
      await database.insert(auditEvents).values({
        action: "asset.issue.submitted",
        actorId: context.actorId,
        correlationId: context.correlationId,
        createdAt: now,
        id: this.#id(),
        idempotencyKey: context.idempotencyKey,
        payloadHash,
        references: { operationRecordId, transactionHashes },
        requestId: context.requestId,
        resourceId: context.aggregateId,
        resourceType: "CLAIM",
        result: "SUBMITTED",
        tenantId: context.tenantId,
      });
      await database.insert(outboxEvents).values({
        aggregateId: context.aggregateId,
        aggregateType: "CLAIM",
        aggregateVersion: Number(context.transaction.sequence),
        eventType: "asset.issue.submitted",
        id: this.#id(),
        idempotencyKey: context.idempotencyKey,
        payload: { claimId: context.aggregateId, operationRecordId, sandbox: true, transactionHashes },
        tenantId: context.tenantId,
      }).onConflictDoNothing();
    });
  }

  async #claimKey(database: JejakDatabase, context: IssuerOperationContext): Promise<{ claimKey: string }> {
    const [claim] = await database.select({ claimKey: claims.claimKey }).from(claims).where(and(
      eq(claims.tenantId, context.tenantId),
      eq(claims.id, context.aggregateId),
    )).limit(1);
    if (claim === undefined) throw new Error("Issuer claim disappeared while recording submission.");
    return claim;
  }

  async #onchainState(claimKey: Buffer): Promise<number | undefined> {
    try {
      const transaction = await this.dependencies.claimLifecycle.get_claim({ claim_key: claimKey });
      if (transaction.result.isErr()) return undefined;
      return Number(transaction.result.unwrap().state);
    } catch {
      return undefined;
    }
  }

  async #indexedIssue(tenantId: string, claimKey: string): Promise<{ ledgerSequence: number; transactionHash: string } | undefined> {
    return this.dependencies.database.transaction(async (transaction) => {
      const [event] = await transaction.select({
        ledgerSequence: chainEvents.ledgerSequence,
        transactionHash: chainEvents.transactionHash,
      }).from(chainEvents).where(and(
        eq(chainEvents.tenantId, tenantId),
        eq(chainEvents.claimKey, claimKey),
        eq(chainEvents.eventType, "asset.issued"),
      )).orderBy(desc(chainEvents.ledgerSequence)).limit(1);
      return event;
    });
  }

  #id(): string { return this.dependencies.nextId?.() ?? uuidv7(); }
  #now(): Date { return this.dependencies.now?.() ?? new Date(); }
}

function assertSimulated(transaction: { result: { isErr(): boolean; unwrapErr(): { message: string } } }, action: string): void {
  if (transaction.result.isErr()) {
    throw new DomainError("PARTNER_REJECTED", `Stellar ${action} simulation failed: ${transaction.result.unwrapErr().message}.`);
  }
}

function hex(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) {
    throw new DomainError("VALIDATION_FAILED", `Canonical ${label} is malformed.`);
  }
  return value;
}

function money(value: unknown): { amountMinor: string; currency: string; issuer?: string; scale: number } {
  const item = object(value);
  if (typeof item.amountMinor !== "string" || !/^[1-9][0-9]*$/.test(item.amountMinor) || typeof item.currency !== "string" || typeof item.scale !== "number") {
    throw new DomainError("VALIDATION_FAILED", "Canonical gross unsettled amount is malformed.");
  }
  return {
    amountMinor: item.amountMinor,
    currency: item.currency,
    ...(typeof item.issuer === "string" ? { issuer: item.issuer } : {}),
    scale: item.scale,
  };
}

function object(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function isReceipt(value: unknown): value is IssuerApprovalReceipt {
  return typeof value === "object" && value !== null && "receiptHash" in value && "partnerReference" in value;
}

function deterministicUuidV7(seed: string): string {
  const bytes = createHash("sha256").update(seed).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hexValue = bytes.toString("hex");
  return `${hexValue.slice(0, 8)}-${hexValue.slice(8, 12)}-${hexValue.slice(12, 16)}-${hexValue.slice(16, 20)}-${hexValue.slice(20)}`;
}
