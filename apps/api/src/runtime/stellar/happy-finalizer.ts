import { and, eq, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";

import type { AssetController, Facility } from "@jejak/stellar-client";

import type { JejakDatabase } from "../../db/client.js";
import { applyTransactionContext } from "../../db/context.js";
import {
  chainPortfolioPositions,
  chainReconciliationExpectations,
  chainSubmissions,
  claims,
  operations,
} from "../../db/schema/index.js";
import { canonicalHash } from "../../reliability/canonical-json.js";
import type { PromotedTestnetManifest } from "./manifest.js";
import type { NodeRoleSigner } from "./node-role-signer.js";

type AssetClient = Pick<AssetController.Client, "close_claim" | "get_issued_for_claim" | "redeem">;
type FacilityClient = Pick<Facility.Client, "release_unused_first_loss">;

/** Completes the happy path only after the indexed waterfall has promoted REPAID. */
export class TestnetHappyClaimFinalizer {
  constructor(private readonly dependencies: {
    assetController: AssetClient;
    database: JejakDatabase;
    facility: FacilityClient;
    facilitySigner: NodeRoleSigner;
    issuerSigner: NodeRoleSigner;
    manifest: PromotedTestnetManifest;
    treasurySigner: NodeRoleSigner;
  }) {}

  async finalizeRepaidClaims(input: { actorId: string; tenantId: string }): Promise<number> {
    const candidates = await this.#candidates(input);
    let finalized = 0;
    for (const candidate of candidates) {
      if (candidate.projectedState === "CLOSED") {
        await this.#promoteIndexedClose(input, candidate.claimId);
        finalized += 1;
        continue;
      }
      if (candidate.claimState !== "REPAID" || candidate.pending) continue;
      const claimKey = Buffer.from(candidate.claimKey, "hex");
      const issuedBaseUnits = await this.#issuedBaseUnits(claimKey);
      if (issuedBaseUnits > 0n) {
        const redeem = await this.dependencies.assetController.redeem({
          amount: issuedBaseUnits,
          claim_key: claimKey,
          facility_holder: this.dependencies.manifest.roles.treasury_holder,
          issuer_operator: this.dependencies.manifest.roles.issuer_operator,
        });
        assertSimulated(redeem, "happy-path redemption");
        await this.dependencies.issuerSigner.submit(redeem, [this.dependencies.treasurySigner]);
      }
      const release = await this.dependencies.facility.release_unused_first_loss({
        claim_key: claimKey,
        operator: this.dependencies.manifest.roles.facility_operator,
      });
      assertSimulated(release, "unused first-loss release");
      await this.dependencies.facilitySigner.submit(release);

      const close = await this.dependencies.assetController.close_claim({
        claim_key: claimKey,
        issuer_operator: this.dependencies.manifest.roles.issuer_operator,
        reason_code: "SETTLEMENT_REPAID",
      });
      assertSimulated(close, "happy-path close");
      const closeReceipt = await this.dependencies.issuerSigner.submit(close);
      await this.#expectClose(input, candidate, closeReceipt);
      finalized += 1;
    }
    return finalized;
  }

  async #candidates(input: { actorId: string; tenantId: string }) {
    return this.dependencies.database.transaction(async (transaction) => {
      const database = transaction as JejakDatabase;
      await applyTransactionContext(database, { ...input, requestId: uuidv7() });
      const rows = await database.select({
        claimId: claims.id,
        claimKey: claims.claimKey,
        claimState: claims.state,
        projectedState: chainPortfolioPositions.state,
      }).from(claims).innerJoin(chainPortfolioPositions, and(
        eq(chainPortfolioPositions.tenantId, input.tenantId),
        eq(chainPortfolioPositions.claimKey, claims.claimKey),
      )).where(and(
        eq(claims.tenantId, input.tenantId),
        eq(claims.state, "REPAID"),
      ));
      const result = [];
      for (const row of rows) {
        const [pending] = await database.select({ id: operations.id }).from(operations).where(and(
          eq(operations.tenantId, input.tenantId),
          eq(operations.kind, "REDEMPTION"),
          eq(operations.resourceId, row.claimId),
          sql`${operations.status} not in ('RECONCILED', 'COMPLETED', 'FAILED')`,
        )).limit(1);
        result.push({ ...row, pending: pending !== undefined });
      }
      return result;
    });
  }

  async #issuedBaseUnits(claimKey: Buffer): Promise<bigint> {
    const transaction = await this.dependencies.assetController.get_issued_for_claim({ claim_key: claimKey });
    const amount = BigInt(transaction.result);
    if (amount < 0n) throw new Error("Testnet issuance lookup returned a negative balance.");
    return amount;
  }

  async #expectClose(
    input: { actorId: string; tenantId: string },
    candidate: { claimId: string; claimKey: string },
    receipt: { ledgerSequence?: number; transactionHash: string },
  ): Promise<void> {
    await this.dependencies.database.transaction(async (transaction) => {
      const database = transaction as JejakDatabase;
      await applyTransactionContext(database, { ...input, requestId: uuidv7() });
      const operationId = uuidv7();
      const submissionId = uuidv7();
      await database.insert(operations).values({
        context: { claimId: candidate.claimId, claimKey: candidate.claimKey },
        id: operationId,
        kind: "REDEMPTION",
        resourceId: candidate.claimId,
        resourceType: "CLAIM",
        status: "PENDING_RECONCILIATION",
        tenantId: input.tenantId,
      });
      await database.insert(chainSubmissions).values({
        envelopeHash: canonicalHash({ action: "CLOSE", claimKey: candidate.claimKey, transactionHash: receipt.transactionHash }),
        id: submissionId,
        idempotencyKey: canonicalHash({ action: "CLOSE", claimId: candidate.claimId }),
        ...(receipt.ledgerSequence === undefined ? {} : { ledgerSequence: receipt.ledgerSequence }),
        network: "testnet",
        operationId,
        status: "CHAIN_SUCCESS_PENDING_RECONCILIATION",
        tenantId: input.tenantId,
        transactionHash: receipt.transactionHash,
      });
      await database.insert(chainReconciliationExpectations).values({
        chainSubmissionId: submissionId,
        claimKey: candidate.claimKey,
        expectedClaimState: "CLOSED",
        expectedEventType: "claim.transitioned",
        id: uuidv7(),
        tenantId: input.tenantId,
      });
    });
  }

  async #promoteIndexedClose(input: { actorId: string; tenantId: string }, claimId: string): Promise<void> {
    await this.dependencies.database.transaction(async (transaction) => {
      const database = transaction as JejakDatabase;
      await applyTransactionContext(database, { ...input, requestId: uuidv7() });
      const [claim] = await database.select().from(claims).where(and(
        eq(claims.tenantId, input.tenantId),
        eq(claims.id, claimId),
      )).limit(1).for("update");
      if (claim === undefined || claim.state === "CLOSED") return;
      const now = new Date();
      const payload = object(claim.canonicalPayload);
      await database.update(claims).set({
        canonicalPayload: { ...payload, state: "CLOSED", updatedAt: now.toISOString(), version: claim.version + 1 },
        state: "CLOSED",
        updatedAt: now,
        version: claim.version + 1,
      }).where(and(eq(claims.tenantId, input.tenantId), eq(claims.id, claimId), eq(claims.version, claim.version)));
    });
  }
}

function assertSimulated(transaction: { result: { isErr(): boolean; unwrapErr(): { message: string } } }, label: string): void {
  if (transaction.result.isErr()) throw new Error(`Testnet ${label} simulation failed: ${transaction.result.unwrapErr().message}.`);
}

function object(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
