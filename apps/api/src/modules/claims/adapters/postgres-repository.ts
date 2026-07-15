import { and, eq } from "drizzle-orm";

import type { JejakDatabase } from "../../../db/client.js";
import { claims, financingOffers } from "../../../db/schema/domain.js";
import { DomainError } from "../../shared/errors.js";
import type { LifecycleClaim } from "../domain/lifecycle.js";
import type { LifecycleOffer } from "../domain/offers.js";

export class PostgresClaimRepository {
  constructor(private readonly transaction: JejakDatabase) {}

  async insert(claim: LifecycleClaim): Promise<void> {
    await this.transaction.insert(claims).values({
      id: claim.id,
      tenantId: claim.tenantId,
      sellerId: claim.sellerId,
      settlementStreamId: claim.settlementStreamId,
      claimKey: claim.claimKey,
      state: claim.state,
      eligibleAmountMinor: claim.eligibleSettlementValue.amountMinor,
      eligibleCurrency: claim.eligibleSettlementValue.currency,
      eligibleScale: claim.eligibleSettlementValue.scale,
      ...(claim.eligibleSettlementValue.issuer === undefined
        ? {}
        : { eligibleIssuer: claim.eligibleSettlementValue.issuer }),
      canonicalPayload: claim,
      createdAt: new Date(claim.createdAt),
      updatedAt: new Date(claim.updatedAt),
      version: claim.version,
    });
  }

  async update(claim: LifecycleClaim, previousVersion: number): Promise<void> {
    const updated = await this.transaction
      .update(claims)
      .set({
        state: claim.state,
        eligibleAmountMinor: claim.eligibleSettlementValue.amountMinor,
        eligibleCurrency: claim.eligibleSettlementValue.currency,
        eligibleScale: claim.eligibleSettlementValue.scale,
        eligibleIssuer: claim.eligibleSettlementValue.issuer ?? null,
        canonicalPayload: claim,
        updatedAt: new Date(claim.updatedAt),
        version: claim.version,
      })
      .where(
        and(
          eq(claims.tenantId, claim.tenantId),
          eq(claims.id, claim.id),
          eq(claims.version, previousVersion),
        ),
      )
      .returning({ id: claims.id });
    if (updated.length !== 1) {
      throw new DomainError("VERSION_CONFLICT", "Claim version changed before persistence.");
    }
  }

  async findById(tenantId: string, claimId: string): Promise<LifecycleClaim | null> {
    const [row] = await this.transaction
      .select({ canonicalPayload: claims.canonicalPayload })
      .from(claims)
      .where(and(eq(claims.tenantId, tenantId), eq(claims.id, claimId)))
      .limit(1);
    return (row?.canonicalPayload as LifecycleClaim | undefined) ?? null;
  }
}

export class PostgresOfferRepository {
  constructor(private readonly transaction: JejakDatabase) {}

  async insert(tenantId: string, offer: LifecycleOffer): Promise<void> {
    try {
      await this.transaction.insert(financingOffers).values({
        id: offer.id,
        tenantId,
        claimId: offer.claimId,
        status: offer.status,
        principalAmountMinor: offer.principal.amountMinor,
        principalCurrency: offer.principal.currency,
        principalScale: offer.principal.scale,
        ...(offer.principal.issuer === undefined ? {} : { principalIssuer: offer.principal.issuer }),
        expiresAt: new Date(offer.expiresAt),
        canonicalPayload: offer,
        createdAt: new Date(offer.createdAt),
        updatedAt: new Date(offer.createdAt),
        version: offer.version,
      });
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "23505" &&
        "constraint_name" in error &&
        error.constraint_name === "financing_offers_active_claim_uq"
      ) {
        throw new DomainError(
          "INVALID_STATE_TRANSITION",
          "Claim already has an active financing offer.",
        );
      }
      throw error;
    }
  }

  async update(tenantId: string, offer: LifecycleOffer, previousVersion: number): Promise<void> {
    const updated = await this.transaction
      .update(financingOffers)
      .set({
        status: offer.status,
        canonicalPayload: offer,
        version: offer.version,
      })
      .where(
        and(
          eq(financingOffers.tenantId, tenantId),
          eq(financingOffers.id, offer.id),
          eq(financingOffers.version, previousVersion),
        ),
      )
      .returning({ id: financingOffers.id });
    if (updated.length !== 1) {
      throw new DomainError("VERSION_CONFLICT", "Offer version changed before persistence.");
    }
  }

  async findById(tenantId: string, offerId: string): Promise<LifecycleOffer | null> {
    const [row] = await this.transaction
      .select({ canonicalPayload: financingOffers.canonicalPayload })
      .from(financingOffers)
      .where(and(eq(financingOffers.tenantId, tenantId), eq(financingOffers.id, offerId)))
      .limit(1);
    return (row?.canonicalPayload as LifecycleOffer | undefined) ?? null;
  }
}
