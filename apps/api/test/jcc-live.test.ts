import { describe, expect, it } from "vitest";
import { v7 as uuidv7 } from "uuid";

import { createDatabase, type JejakDatabase } from "../src/db/client.js";
import { applyTransactionContext } from "../src/db/context.js";
import {
  claims,
  marketplaceConnections,
  sellers,
  settlementStreams,
} from "../src/db/schema/domain.js";
import { organizations } from "../src/db/schema/identity.js";
import { chainEvents } from "../src/db/schema/chain.js";
import { operations } from "../src/db/schema/reliability.js";
import { PostgresJccRepository } from "../src/modules/jcc/adapters/postgres-repository.js";
import { PostgresJccSubmissionJournal } from "../src/modules/jcc/adapters/postgres-submission-journal.js";
import { PostgresEligibilityRegistryReconciler } from "../src/modules/jcc/adapters/postgres-registry-reconciler.js";
import {
  assembleSignedJccEnvelope,
  buildJccSigningRequest,
} from "../src/modules/jcc/domain/attestation.js";
import { canonicalHash } from "../src/reliability/canonical-json.js";
import { PostgresRiskOperationJournal } from "../src/modules/risk/adapters/postgres-operation-journal.js";

const liveDatabaseUrl = process.env.JEJAK_BE0809_LIVE_DATABASE_URL;
const liveEnabled = process.env.JEJAK_RUN_LIVE_BE0809 === "true" && liveDatabaseUrl !== undefined;

class RollbackAcceptance extends Error {}

function envelope(input: { attestationId: string; claimId: string; settlementStreamId: string; signature?: string }) {
  const request = buildJccSigningRequest({
    id: input.attestationId,
    claimId: input.claimId,
    claimKey: "a".repeat(64),
    sellerSubjectHash: "b".repeat(64),
    settlementStreamId: input.settlementStreamId,
    dataSnapshotHash: "c".repeat(64),
    modelId: "risk-live-test",
    modelVersion: "v1",
    policyVersion: "policy-v1",
    decision: "ELIGIBLE",
    sdsBps: 800,
    grossUnsettled: { amountMinor: "10000", currency: "TIDR", scale: 2 },
    eligibleSettlementValue: { amountMinor: "8000", currency: "TIDR", scale: 2 },
    maxAdvanceAmount: { amountMinor: "6400", currency: "TIDR", scale: 2 },
    reasonCodes: ["POLICY_LIMIT"],
    issuedAt: "2026-07-15T00:00:00Z",
    expiresAt: "2026-07-16T00:00:00Z",
  });
  const keyId = "risk-live-test-key";
  const signature = input.signature ?? Buffer.from("live-test-signature").toString("base64");
  return assembleSignedJccEnvelope(request, {
    attestationId: request.attestationId,
    payloadHash: request.payloadHash,
    keyId,
    signature,
    envelopeHash: canonicalHash({
      domain: request.domain,
      attestation: { ...request.payload, keyId, signature },
    }),
  });
}

describe.skipIf(!liveEnabled)("BE-09 live PostgreSQL JCC repository", () => {
  it("proves insert, replay, tenant isolation, status versioning, and signed-payload immutability", async () => {
    const handle = createDatabase(liveDatabaseUrl as string);
    const tenantA = uuidv7();
    const tenantB = uuidv7();
    const sellerId = uuidv7();
    const connectionId = uuidv7();
    const streamId = uuidv7();
    const claimId = uuidv7();
    const attestationId = uuidv7();
    try {
      await handle.db.transaction(async (rawTransaction) => {
        const database = rawTransaction as unknown as JejakDatabase;
        await database.insert(organizations).values([
          {
            id: tenantA,
            name: "BE09 Live Tenant A",
            organizationType: "TEST",
            sellerSubjectSaltRef: `test:${tenantA}`,
            slug: `be09-${tenantA}`,
          },
          {
            id: tenantB,
            name: "BE09 Live Tenant B",
            organizationType: "TEST",
            sellerSubjectSaltRef: `test:${tenantB}`,
            slug: `be09-${tenantB}`,
          },
        ]);
        await database.insert(sellers).values({
          id: sellerId,
          tenantId: tenantA,
          sellerSubject: `seller:${sellerId}`,
          status: "ACTIVE",
          canonicalPayload: {},
        });
        await database.insert(marketplaceConnections).values({
          id: connectionId,
          tenantId: tenantA,
          sellerId,
          source: "SANDBOX",
          externalId: `sandbox:${connectionId}`,
          status: "ACTIVE",
          canonicalPayload: {},
        });
        await database.insert(settlementStreams).values({
          id: streamId,
          tenantId: tenantA,
          sellerId,
          marketplaceConnectionId: connectionId,
          sourceHash: "c".repeat(64),
          cutoffAt: new Date("2026-07-15T00:00:00Z"),
          expectedSettlementAmountMinor: "10000",
          expectedSettlementCurrency: "TIDR",
          expectedSettlementScale: 2,
          canonicalPayload: {},
        });
        await database.insert(claims).values({
          id: claimId,
          tenantId: tenantA,
          sellerId,
          settlementStreamId: streamId,
          claimKey: "a".repeat(64),
          state: "ELIGIBLE",
          eligibleAmountMinor: "8000",
          eligibleCurrency: "TIDR",
          eligibleScale: 2,
          canonicalPayload: {},
        });
        const actorContext = {
          actorId: uuidv7(),
          requestId: uuidv7(),
          tenantId: tenantA,
        };
        await applyTransactionContext(database, actorContext);

        const repository = new PostgresJccRepository(database, {
          now: () => new Date("2026-07-15T01:00:00Z"),
        });
        const signed = envelope({ attestationId, claimId, settlementStreamId: streamId });
        const first = await repository.insertOrFind({ envelope: signed, tenantId: tenantA });
        const replay = await repository.insertOrFind({ envelope: signed, tenantId: tenantA });
        expect(replay).toEqual(first);
        expect(await repository.findById({ attestationId, tenantId: tenantB })).toBeNull();

        await expect(
          repository.insertOrFind({
            envelope: envelope({
              attestationId,
              claimId,
              settlementStreamId: streamId,
              signature: Buffer.from("conflicting-signature").toString("base64"),
            }),
            tenantId: tenantA,
          }),
        ).rejects.toThrow(/different canonical envelope|conflicts/);

        const active = await repository.updateOperationalStatus({
          attestationId,
          expectedVersion: first.version,
          status: "ACTIVE",
          tenantId: tenantA,
        });
        const revoked = await repository.updateOperationalStatus({
          attestationId,
          expectedVersion: active.version,
          status: "REVOKED",
          tenantId: tenantA,
        });
        expect(revoked.version).toBe(3);
        expect(revoked.envelope).toEqual(first.envelope);

        const chainJournal = new PostgresJccSubmissionJournal(database, actorContext, {
          now: () => new Date("2026-07-15T01:00:00Z"),
        });
        const chainInput = {
          attestationId,
          attestationKey: signed.attestation.attestationKey,
          envelopeHash: signed.envelopeHash,
          idempotencyKey: canonicalHash({ attestationId, action: "REGISTER" }),
          network: "TESTNET",
          operationId: uuidv7(),
          operationKind: "JCC_REGISTER" as const,
          tenantId: tenantA,
        };
        const prepared = await chainJournal.begin(chainInput);
        expect(prepared.kind).toBe("NEW");
        if (prepared.kind !== "NEW") throw new Error("Expected a new chain submission.");
        await chainJournal.markSubmitted({
          submissionId: prepared.submissionId,
          attestationKey: signed.attestation.attestationKey,
          envelopeHash: signed.envelopeHash,
          transactionHash: "d".repeat(64),
          operationId: chainInput.operationId,
          tenantId: tenantA,
        });
        const submissionReplay = await chainJournal.begin(chainInput);
        expect(submissionReplay).toMatchObject({
          kind: "REPLAY",
          submission: { submissionId: prepared.submissionId, transactionHash: "d".repeat(64) },
        });
        expect(
          await chainJournal.begin({ ...chainInput, envelopeHash: "e".repeat(64) }),
        ).toEqual({ kind: "CONFLICT" });
        await database.insert(chainEvents).values({
          id: uuidv7(),
          tenantId: tenantA,
          network: "TESTNET",
          contractName: "eligibility_registry",
          contractId: "C".repeat(56),
          eventId: `be09-${attestationId}`,
          eventType: "attestation.registered",
          ledgerSequence: 1,
          transactionHash: "d".repeat(64),
          transactionIndex: 0,
          operationIndex: 0,
          rpcCursor: `be09:${attestationId}`,
          claimKey: signed.attestation.claimKey,
          actorAddress: issueInputOracle,
          safePayload: {
            attestationKey: signed.attestation.attestationKey,
            envelopeHash: signed.envelopeHash,
            expiresAt: signed.attestation.expiresAt,
          },
          payloadHash: canonicalHash({
            attestationKey: signed.attestation.attestationKey,
            envelopeHash: signed.envelopeHash,
            expiresAt: signed.attestation.expiresAt,
          }),
          ledgerClosedAt: new Date("2026-07-15T01:00:00Z"),
        });
        const registryReconciler = new PostgresEligibilityRegistryReconciler(
          database,
          actorContext,
          "TESTNET",
        );
        await expect(
          registryReconciler.reconcile({
            submissionId: prepared.submissionId,
            attestationKey: signed.attestation.attestationKey,
            envelopeHash: signed.envelopeHash,
            transactionHash: "d".repeat(64),
            expectedStatus: "ACTIVE",
          }),
        ).resolves.toMatchObject({ reconciled: true, record: { status: "ACTIVE" } });

        const riskOperationId = uuidv7();
        await database.insert(operations).values({
          id: riskOperationId,
          tenantId: tenantA,
          kind: "RISK_EVALUATION",
          status: "QUEUED",
          resourceType: "CLAIM",
          resourceId: claimId,
          context: {
            claimId,
            settlementStreamId: streamId,
            snapshotCutoffAt: "2026-07-15T00:00:00Z",
          },
        });
        const riskJournal = new PostgresRiskOperationJournal(database, actorContext);
        const claimed = await riskJournal.claim({
          operationId: riskOperationId,
          staleBefore: new Date("2026-07-15T00:00:00Z"),
          tenantId: tenantA,
        });
        expect(claimed.kind).toBe("CLAIMED");
        expect(
          await riskJournal.claim({
            operationId: riskOperationId,
            staleBefore: new Date("2026-07-15T00:00:00Z"),
            tenantId: tenantA,
          }),
        ).toEqual({ kind: "BUSY" });
        await riskJournal.markFailed({
          operationId: riskOperationId,
          retryable: true,
          safeErrorClass: "PARTNER_TIMEOUT",
          tenantId: tenantA,
        });
        expect(
          await riskJournal.claim({
            operationId: riskOperationId,
            staleBefore: new Date("2026-07-15T00:00:00Z"),
            tenantId: tenantA,
          }),
        ).toMatchObject({ kind: "CLAIMED" });
        throw new RollbackAcceptance();
      });
    } catch (error) {
      if (!(error instanceof RollbackAcceptance)) throw error;
    } finally {
      await handle.close();
    }
  });
});

const issueInputOracle = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
