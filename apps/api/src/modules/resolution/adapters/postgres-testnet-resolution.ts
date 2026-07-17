import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";

import type { AssetController } from "@jejak/stellar-client";

import type { JejakDatabase } from "../../../db/client.js";
import { applyTransactionContext } from "../../../db/context.js";
import {
  chainReconciliationExpectations,
  chainSubmissions,
  claims,
  operations,
  waterfallResults,
} from "../../../db/schema/index.js";
import { canonicalHash } from "../../../reliability/canonical-json.js";
import type { GeneratedLifecycleResolutionActions, NodeRoleSigner, PromotedTestnetManifest } from "../../../runtime/stellar/index.js";
import type { StellarSubmissionReceipt } from "../../../runtime/stellar/signer.js";
import type { ResolutionRepository } from "../application/resolution-service.js";
import type { ResolutionMoney } from "../domain/resolution.js";

type AssetControllerClient = Pick<AssetController.Client, "clawback_claim" | "get_issued_for_claim">;

/** Submits each resolution mutation to Testnet before committing its canonical DB view. */
export class PostgresTestnetResolutionRepository implements ResolutionRepository {
  constructor(private readonly dependencies: {
    actions: GeneratedLifecycleResolutionActions;
    assetController: AssetControllerClient;
    database: JejakDatabase;
    delegate: ResolutionRepository;
    issuerSigner: NodeRoleSigner;
    manifest: PromotedTestnetManifest;
  }) {}

  load(input: Parameters<ResolutionRepository["load"]>[0]) {
    return this.dependencies.delegate.load(input);
  }

  replay(input: Parameters<NonNullable<ResolutionRepository["replay"]>>[0]) {
    return this.dependencies.delegate.replay?.(input) ?? Promise.resolve(undefined);
  }

  async mutate(input: Parameters<ResolutionRepository["mutate"]>[0]) {
    const replay = await this.replay({ context: input.context, payloadHash: input.payloadHash });
    if (replay !== undefined) return replay;
    const before = await this.dependencies.delegate.load({ claimId: input.claimId, context: input.context });
    if (before === undefined) throw new Error("Resolution claim disappeared before Testnet submission.");
    const facts = await this.#facts(input);
    const identity = (action: string) => ({
      requestHash: canonicalHash({ action, claimId: input.claimId, payloadHash: input.payloadHash }),
      submissionId: `${action.toLowerCase()}:${input.context.idempotencyKey}`.slice(0, 128),
    });
    const evidenceHash = input.evidenceHashes[0] ?? canonicalHash({
      action: input.action,
      claimId: input.claimId,
      idempotencyKey: input.context.idempotencyKey,
    });
    const chainCase = await this.dependencies.actions.getResolution(facts.claimKey);
    let resolutionReceipt: StellarSubmissionReceipt | undefined;
    let expectedClaimState = "RESOLUTION";

    if (input.action === "OPEN") {
      if (chainCase === undefined) {
        resolutionReceipt = await this.dependencies.actions.openResolution({
          ...identity("RESOLUTION_OPEN"),
          claimKey: facts.claimKey,
          evidenceHash,
          reasonCode: input.reasonCodes[0]!,
          resolver: this.dependencies.manifest.roles.resolver,
        });
      } else if (
        chainCase.openingEvidenceHash !== evidenceHash ||
        chainCase.reasonCode !== input.reasonCodes[0] ||
        chainCase.resolver !== this.dependencies.manifest.roles.resolver ||
        ![0, 1].includes(chainCase.status)
      ) {
        throw new Error("Existing Testnet resolution does not match the replayed open command.");
      }
    } else if (input.action === "UPDATE") {
      const previous = BigInt(before.case?.recoveryRealized.amountMinor ?? "0");
      const cumulative = BigInt(input.recoveryRealized?.amountMinor ?? previous.toString());
      if (chainCase === undefined || ![0, 1].includes(chainCase.status)) {
        throw new Error("An open Testnet resolution is required before recording recovery.");
      }
      const onchainRecovered = BigInt(chainCase.recovered);
      if (cumulative < onchainRecovered) {
        throw new Error("Canonical recovery cannot be lower than the Testnet recovery total.");
      }
      if (chainCase.status === 0 || cumulative > onchainRecovered) {
        resolutionReceipt = await this.dependencies.actions.recordRecovery({
          ...identity("RESOLUTION_RECOVERY"),
          amount: (cumulative - onchainRecovered).toString(),
          claimKey: facts.claimKey,
          evidenceHash,
          resolver: this.dependencies.manifest.roles.resolver,
        });
      }
    } else {
      const recovered = input.recoveryRealized ?? before.case?.recoveryRealized ?? zero(facts.seniorLoss);
      const loss = BigInt(facts.seniorLoss.amountMinor) - BigInt(recovered.amountMinor);
      const finalLoss = loss > 0n ? loss.toString() : "0";
      expectedClaimState = BigInt(finalLoss) > 0n ? "CLOSED_WITH_LOSS" : "CLOSED";
      if (chainCase === undefined) throw new Error("An open Testnet resolution is required before closing.");
      if ([2, 3].includes(chainCase.status)) {
        if (chainCase.finalLoss !== finalLoss || chainCase.recovered !== recovered.amountMinor) {
          throw new Error("Closed Testnet resolution does not match the replayed close command.");
        }
      } else {
        resolutionReceipt = await this.dependencies.actions.closeResolution({
          ...identity("RESOLUTION_CLOSE"),
          claimKey: facts.claimKey,
          finalLoss,
          recovered: recovered.amountMinor,
          resolutionHash: canonicalHash({ claimKey: facts.claimKey, evidenceHash, finalLoss, recovered: recovered.amountMinor }),
          resolver: this.dependencies.manifest.roles.resolver,
        });
      }
      const issued = await this.dependencies.assetController.get_issued_for_claim({
        claim_key: Buffer.from(facts.claimKey, "hex"),
      });
      const issuedBaseUnits = BigInt(issued.result);
      if (issuedBaseUnits > 0n) {
        const clawback = await this.dependencies.assetController.clawback_claim({
          amount: issuedBaseUnits,
          claim_key: Buffer.from(facts.claimKey, "hex"),
          facility_holder: this.dependencies.manifest.roles.treasury_holder,
          issuer_operator: this.dependencies.manifest.roles.issuer_operator,
          reason_code: "LOSS_FINALIZED",
        });
        if (clawback.result.isErr()) throw new Error(`Testnet claim clawback simulation failed: ${clawback.result.unwrapErr().message}.`);
        await this.dependencies.issuerSigner.submit(clawback);
      }
    }
    if (resolutionReceipt !== undefined) {
      await this.#recordSubmission(input, facts.claimKey, expectedClaimState, resolutionReceipt);
    }
    return this.dependencies.delegate.mutate(input);
  }

  async #recordSubmission(
    input: Parameters<ResolutionRepository["mutate"]>[0],
    claimKey: string,
    expectedClaimState: string,
    receipt: StellarSubmissionReceipt,
  ): Promise<void> {
    await this.dependencies.database.transaction(async (transaction) => {
      const database = transaction as JejakDatabase;
      await applyTransactionContext(database, input.context);
      const seed = canonicalHash({
        action: input.action,
        claimId: input.claimId,
        idempotencyKey: input.context.idempotencyKey,
        tenantId: input.context.tenantId,
      });
      const operationId = deterministicUuidV7(`${seed}:operation`);
      const submissionId = deterministicUuidV7(`${seed}:submission`);
      const expectedEventType = input.action === "OPEN"
        ? "resolution.opened"
        : input.action === "UPDATE"
          ? "recovery.recorded"
          : "resolution.closed";
      await database.insert(operations).values({
        context: { action: input.action, claimId: input.claimId, claimKey },
        id: operationId,
        kind: "RESOLUTION",
        resourceId: input.claimId,
        resourceType: "CLAIM",
        status: "PENDING_RECONCILIATION",
        tenantId: input.context.tenantId,
      }).onConflictDoNothing();
      await database.insert(chainSubmissions).values({
        envelopeHash: canonicalHash({ action: input.action, claimKey, transactionHash: receipt.transactionHash }),
        id: submissionId,
        idempotencyKey: `${input.context.idempotencyKey}:${expectedEventType}`,
        ...(receipt.ledgerSequence === undefined ? {} : { ledgerSequence: receipt.ledgerSequence }),
        network: "testnet",
        operationId,
        status: "CHAIN_SUCCESS_PENDING_RECONCILIATION",
        tenantId: input.context.tenantId,
        transactionHash: receipt.transactionHash,
      }).onConflictDoNothing();
      await database.insert(chainReconciliationExpectations).values({
        chainSubmissionId: submissionId,
        claimKey,
        expectedClaimState,
        expectedEventType,
        id: deterministicUuidV7(`${seed}:expectation`),
        tenantId: input.context.tenantId,
      }).onConflictDoNothing();
    });
  }

  async #facts(input: Parameters<ResolutionRepository["mutate"]>[0]): Promise<{
    claimKey: string;
    seniorLoss: ResolutionMoney;
  }> {
    return this.dependencies.database.transaction(async (transaction) => {
      const database = transaction as JejakDatabase;
      await applyTransactionContext(database, input.context);
      const [row] = await database.select({ claimKey: claims.claimKey }).from(claims).where(and(
        eq(claims.tenantId, input.context.tenantId),
        eq(claims.id, input.claimId),
      )).limit(1);
      const [waterfall] = await database.select({ allocation: waterfallResults.allocationPayload }).from(waterfallResults).where(and(
        eq(waterfallResults.tenantId, input.context.tenantId),
        eq(waterfallResults.claimId, input.claimId),
      )).orderBy(desc(waterfallResults.createdAt)).limit(1);
      if (row === undefined || waterfall === undefined) throw new Error("Reconciled claim and waterfall facts are required for Testnet resolution.");
      const seniorLoss = money(object(waterfall.allocation).seniorLoss);
      return { claimKey: row.claimKey, seniorLoss };
    });
  }
}

function object(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function money(value: unknown): ResolutionMoney {
  const item = object(value);
  if (typeof item.amountMinor !== "string" || typeof item.currency !== "string" || typeof item.scale !== "number") {
    throw new Error("Waterfall senior-loss money is malformed.");
  }
  return {
    amountMinor: item.amountMinor,
    currency: item.currency,
    ...(typeof item.issuer === "string" ? { issuer: item.issuer } : {}),
    scale: item.scale,
  };
}

function zero(value: ResolutionMoney): ResolutionMoney {
  return { ...value, amountMinor: "0" };
}

function deterministicUuidV7(seed: string): string {
  const bytes = createHash("sha256").update(seed).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const value = bytes.toString("hex");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}
