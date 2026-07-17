import { and, desc, eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";

import type { JejakDatabase } from "../../db/client.js";
import { applyTransactionContext } from "../../db/context.js";
import {
  auditEvents,
  claims,
  facilityPositions,
  idempotencyRecords,
  marketplaceConnections,
  membershipRoleGrants,
  organizationMemberships,
  organizations,
  outboxEvents,
  resourceAssignments,
  sellers,
  userProfiles,
  workloadIdentities,
} from "../../db/schema/index.js";
import { PostgresClaimRepository } from "../claims/adapters/postgres-repository.js";
import { PostgresDecisionSnapshotRepository } from "../reconciliation/adapters/postgres-repository.js";
import { IdempotencyConflictError } from "../../reliability/mutation-coordinator.js";
import { canonicalHash } from "../../reliability/canonical-json.js";
import type { DemoContext, DemoResetRepository, DemoSeedPlan } from "./reset-service.js";

const operationId = "resetDemo";

export class PostgresDemoResetRepository implements DemoResetRepository {
  constructor(
    private readonly database: JejakDatabase,
    private readonly options: { nextId?: () => string; now?: () => Date } = {},
  ) {}

  async reset(input: {
    idempotencyKey: string;
    payloadHash: string;
    plan: DemoSeedPlan;
    requestId: string;
  }): Promise<DemoContext> {
    const nextId = this.options.nextId ?? uuidv7;
    const now = this.options.now ?? (() => new Date());
    return this.database.transaction(async (transaction) => {
      const database = transaction as JejakDatabase;
      await applyTransactionContext(database, {
        actorId: input.plan.systemActorId,
        requestId: input.requestId,
        tenantId: input.plan.context.tenantId,
      });
      await database.insert(organizations).values({
        id: input.plan.context.tenantId,
        name: `Jejak Demo ${input.plan.context.scenario}`,
        organizationType: "DEMO_SANDBOX",
        sellerSubjectSaltRef: "env://DEMO_SELLER_SUBJECT_SALT",
        slug: `demo-${input.plan.context.tenantId}`,
      }).onConflictDoNothing();

      const [claimed] = await database.insert(idempotencyRecords).values({
        actorId: input.plan.systemActorId,
        expiresAt: new Date(now().valueOf() + 86_400_000),
        id: nextId(),
        idempotencyKey: input.idempotencyKey,
        operationId,
        payloadHash: input.payloadHash,
        tenantId: input.plan.context.tenantId,
      }).onConflictDoNothing().returning({ id: idempotencyRecords.id });
      if (claimed === undefined) {
        const [existing] = await database.select({
          payloadHash: idempotencyRecords.payloadHash,
          responseBody: idempotencyRecords.responseBody,
        }).from(idempotencyRecords).where(and(
          eq(idempotencyRecords.tenantId, input.plan.context.tenantId),
          eq(idempotencyRecords.actorId, input.plan.systemActorId),
          eq(idempotencyRecords.operationId, operationId),
          eq(idempotencyRecords.idempotencyKey, input.idempotencyKey),
        )).limit(1);
        if (existing === undefined || existing.payloadHash !== input.payloadHash || existing.responseBody === null) {
          throw new IdempotencyConflictError();
        }
        return existing.responseBody as DemoContext;
      }

      // The demo tenant/claim ids are deterministic per scenario, so a repeat
      // reset (new idempotency key, same scenario) would re-seed the same rows
      // and violate uniqueness. Seed only when the claim does not already exist;
      // otherwise return the current authoritative state.
      const [alreadySeeded] = await database.select({ state: claims.state, version: claims.version })
        .from(claims)
        .where(and(eq(claims.tenantId, input.plan.context.tenantId), eq(claims.id, input.plan.context.claimId)))
        .limit(1);
      if (alreadySeeded === undefined) {
        await this.#seedIdentities(database, input.plan);
        await this.#seedPrerequisites(database, input.plan);
      }
      const seededContext: DemoContext = alreadySeeded === undefined
        ? input.plan.context
        : { ...input.plan.context, claimState: alreadySeeded.state, version: alreadySeeded.version };

      await database.insert(auditEvents).values({
        action: "demo.prerequisites.seeded",
        actorId: input.plan.systemActorId,
        id: nextId(),
        idempotencyKey: input.idempotencyKey,
        payloadHash: input.payloadHash,
        references: {
          checkpoint: input.plan.context.claimState,
          provenance: "DEMO_RESET",
          scenario: input.plan.context.scenario,
        },
        requestId: input.requestId,
        resourceId: input.plan.context.claimId,
        resourceType: "CLAIM",
        result: "SUCCESS",
        tenantId: input.plan.context.tenantId,
      });
      await database.insert(outboxEvents).values({
        aggregateId: input.plan.context.claimId,
        aggregateType: "CLAIM",
        aggregateVersion: input.plan.context.version,
        eventType: "demo.prerequisites.seeded",
        id: nextId(),
        idempotencyKey: input.idempotencyKey,
        payload: {
          claimId: input.plan.context.claimId,
          provenance: "DEMO_RESET",
          scenario: input.plan.context.scenario,
        },
        tenantId: input.plan.context.tenantId,
      });
      await database.update(idempotencyRecords).set({
        completedAt: now(),
        responseBody: seededContext,
        responseHash: canonicalHash(seededContext),
        responseStatus: 200,
      }).where(and(
        eq(idempotencyRecords.tenantId, input.plan.context.tenantId),
        eq(idempotencyRecords.actorId, input.plan.systemActorId),
        eq(idempotencyRecords.operationId, operationId),
        eq(idempotencyRecords.idempotencyKey, input.idempotencyKey),
        eq(idempotencyRecords.payloadHash, input.payloadHash),
      ));
      return seededContext;
    });
  }

  async findContext(tenantId: string): Promise<DemoContext | undefined> {
    return this.database.transaction(async (transaction) => {
      const database = transaction as JejakDatabase;
      await applyTransactionContext(database, { actorId: tenantId, requestId: tenantId, tenantId });
      const [record] = await database.select({ responseBody: idempotencyRecords.responseBody })
        .from(idempotencyRecords)
        .where(and(eq(idempotencyRecords.tenantId, tenantId), eq(idempotencyRecords.operationId, operationId)))
        .orderBy(desc(idempotencyRecords.completedAt))
        .limit(1);
      if (record?.responseBody === null || record?.responseBody === undefined) return undefined;
      const stored = record.responseBody as DemoContext;
      const [claim] = await database.select({ state: claims.state, version: claims.version })
        .from(claims)
        .where(and(eq(claims.tenantId, tenantId), eq(claims.id, stored.claimId)))
        .limit(1);
      if (claim === undefined) return undefined;
      return { ...stored, claimState: claim.state, version: claim.version };
    });
  }

  async #seedIdentities(database: JejakDatabase, plan: DemoSeedPlan): Promise<void> {
    for (const actor of plan.actors) {
      if (actor.role === "SYSTEM") {
        await database.insert(workloadIdentities).values({
          id: actor.actorId,
          name: "jejak-demo-system",
          role: actor.role,
          status: "ACTIVE",
          tenantId: plan.context.tenantId,
          verifier: "DEMO_JWT",
        });
        continue;
      }
      if (actor.profileId === undefined || actor.membershipId === undefined || actor.roleGrantId === undefined) {
        throw new Error("Human demo actor identifiers are incomplete.");
      }
      await applyTransactionContext(database, {
        actorId: actor.profileId,
        requestId: plan.context.tenantId,
        tenantId: plan.context.tenantId,
      });
      await database.insert(userProfiles).values({ id: actor.profileId, authSubject: actor.actorId, status: "ACTIVE" });
      await database.insert(organizationMemberships).values({
        activatedAt: new Date(plan.context.resetAt),
        id: actor.membershipId,
        status: "ACTIVE",
        tenantId: plan.context.tenantId,
        userProfileId: actor.profileId,
      });
      await database.insert(membershipRoleGrants).values({
        id: actor.roleGrantId,
        membershipId: actor.membershipId,
        reason: "DEMO_RESET",
        role: actor.role,
        status: "ACTIVE",
        tenantId: plan.context.tenantId,
        validFrom: new Date(plan.context.resetAt),
      });
    }
    await applyTransactionContext(database, {
      actorId: plan.systemActorId,
      requestId: plan.context.tenantId,
      tenantId: plan.context.tenantId,
    });
  }

  async #seedPrerequisites(database: JejakDatabase, plan: DemoSeedPlan): Promise<void> {
    await database.insert(sellers).values({
      canonicalPayload: { provenance: "DEMO_RESET", sellerSubject: `demo:${plan.context.tenantId}` },
      id: plan.sellerId,
      sellerSubject: canonicalHash({ tenantId: plan.context.tenantId, type: "DEMO_SELLER" }),
      status: "ACTIVE",
      tenantId: plan.context.tenantId,
    });
    await database.insert(marketplaceConnections).values({
      canonicalPayload: { mode: "SANDBOX", provenance: "DEMO_RESET", provider: "JEJAK_DEMO" },
      credentialSecretRef: "env://DEMO_MARKETPLACE_CREDENTIAL",
      externalId: `demo-${plan.context.tenantId}`,
      id: plan.marketplaceConnectionId,
      sellerId: plan.sellerId,
      source: "JEJAK_DEMO",
      status: "ACTIVE",
      tenantId: plan.context.tenantId,
    });
    await new PostgresDecisionSnapshotRepository(database).insert(plan.snapshot);
    if (plan.claim.state === "FUNDED") {
      await database.insert(claims).values({
        canonicalPayload: plan.claim,
        claimKey: plan.claim.claimKey,
        eligibleAmountMinor: plan.claim.eligibleSettlementValue.amountMinor,
        eligibleCurrency: plan.claim.eligibleSettlementValue.currency,
        eligibleScale: plan.claim.eligibleSettlementValue.scale,
        id: plan.claim.id,
        sellerId: plan.claim.sellerId,
        settlementStreamId: plan.claim.settlementStreamId,
        state: plan.claim.state,
        tenantId: plan.claim.tenantId,
        version: plan.claim.version,
      });
      await database.insert(facilityPositions).values({
        canonicalPayload: {
          outstandingPrincipal: plan.claim.outstandingPrincipal,
          provenance: "DEMO_RESET_RECONCILED_CHECKPOINT",
          reconciled: true,
        },
        claimId: plan.claim.id,
        id: plan.facilityPositionId,
        outstandingAmountMinor: plan.claim.outstandingPrincipal.amountMinor,
        outstandingCurrency: plan.claim.outstandingPrincipal.currency,
        outstandingScale: plan.claim.outstandingPrincipal.scale,
        status: "FUNDED",
        tenantId: plan.context.tenantId,
      });
    } else {
      await new PostgresClaimRepository(database).insert(plan.claim);
    }
    for (const actor of plan.actors) {
      if (actor.membershipId === undefined) continue;
      await database.insert(resourceAssignments).values({
        // Every claim-mutation route (claims/routes.ts, settlement/routes.ts) checks for the
        // literal "MANAGE" capability on this resource; "OPERATE" was never a recognized value
        // anywhere, so no seeded demo actor could ever pass a resource-authorized command.
        capability: actor.role === "RESOLVER" ? "RESOLVE" : "MANAGE",
        id: this.options.nextId?.() ?? uuidv7(),
        membershipId: actor.membershipId,
        resourceId: plan.context.claimId,
        resourceType: "CLAIM",
        status: "ACTIVE",
        tenantId: plan.context.tenantId,
      });
    }
  }
}
