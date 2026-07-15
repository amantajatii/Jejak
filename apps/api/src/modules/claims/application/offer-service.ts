import { v7 as uuidv7 } from "uuid";

import type { JejakDatabase } from "../../../db/client.js";
import {
  MutationCoordinator,
  type MutationScope,
} from "../../../reliability/mutation-coordinator.js";
import {
  PostgresMutationUnitOfWork,
  type PostgresMutationTransaction,
} from "../../../reliability/postgres-mutation-unit.js";
import type { MoneyValue } from "../../shared/money.js";
import {
  PostgresClaimRepository,
  PostgresOfferRepository,
} from "../adapters/postgres-repository.js";
import {
  acceptFinancingOffer,
  createFinancingOffer,
  type LifecycleOffer,
} from "../domain/offers.js";
import type { ClaimCommandContext } from "./claim-service.js";

function scope(context: ClaimCommandContext, operationId: string): MutationScope {
  return {
    actorId: context.actorId,
    tenantId: context.tenantId,
    requestId: context.requestId,
    idempotencyKey: context.idempotencyKey,
    operationId,
  };
}

export class FinancingOfferApplication {
  constructor(
    private readonly database: JejakDatabase,
    private readonly context: ClaimCommandContext,
    private readonly options: { nextId?: () => string; now?: () => Date } = {},
  ) {}

  async create(input: {
    claimId: string;
    originatorId: string;
    principal: MoneyValue;
    fee: MoneyValue;
    annualizedRateBps: number;
    advanceRateBps: number;
    expiresAt: string;
    termsHash: string;
    hasActiveOffer: boolean;
  }): Promise<LifecycleOffer> {
    const nextId = this.options.nextId ?? uuidv7;
    const now = this.options.now ?? (() => new Date());
    const offerId = nextId();
    const unit = new PostgresMutationUnitOfWork<LifecycleOffer>(this.database, this.context, {
      nextId,
      now,
    });
    const coordinator = new MutationCoordinator<
      LifecycleOffer,
      PostgresMutationTransaction<LifecycleOffer>
    >(unit);
    return coordinator.execute({
      scope: scope(this.context, "createFinancingOffer"),
      payload: input,
      responseStatus: 201,
      audit: {
        action: "financing_offer.created",
        resourceType: "FINANCING_OFFER",
        resourceId: offerId,
        afterVersion: 1,
      },
      event: {
        aggregateId: offerId,
        aggregateType: "FINANCING_OFFER",
        aggregateVersion: 1,
        eventType: "financing_offer.created",
        payload: {
          offerId,
          claimId: input.claimId,
          status: "OFFERED",
          expiresAt: input.expiresAt,
          termsHash: input.termsHash,
        },
      },
      mutate: async (transaction) => {
        const claim = await new PostgresClaimRepository(transaction.database).findById(
          this.context.tenantId,
          input.claimId,
        );
        if (claim === null) throw new Error("Claim is unavailable for offer creation.");
        const offer = createFinancingOffer({
          id: offerId,
          originatorId: input.originatorId,
          claim,
          principal: input.principal,
          fee: input.fee,
          annualizedRateBps: input.annualizedRateBps,
          advanceRateBps: input.advanceRateBps,
          expiresAt: input.expiresAt,
          termsHash: input.termsHash,
          hasActiveOffer: input.hasActiveOffer,
          now: now().toISOString(),
        });
        await new PostgresOfferRepository(transaction.database).insert(
          this.context.tenantId,
          offer,
        );
        return offer;
      },
    });
  }

  async accept(input: {
    offerId: string;
    expectedVersion: number;
    acceptedTermsHash: string;
    sellerAuthorized: boolean;
  }): Promise<LifecycleOffer> {
    const nextId = this.options.nextId ?? uuidv7;
    const now = this.options.now ?? (() => new Date());
    const unit = new PostgresMutationUnitOfWork<LifecycleOffer>(this.database, this.context, {
      nextId,
      now,
    });
    const coordinator = new MutationCoordinator<
      LifecycleOffer,
      PostgresMutationTransaction<LifecycleOffer>
    >(unit);
    return coordinator.execute({
      scope: scope(this.context, "acceptFinancingOffer"),
      payload: input,
      audit: {
        action: "financing_offer.accepted",
        resourceType: "FINANCING_OFFER",
        resourceId: input.offerId,
        beforeVersion: input.expectedVersion,
        afterVersion: input.expectedVersion + 1,
      },
      event: {
        aggregateId: input.offerId,
        aggregateType: "FINANCING_OFFER",
        aggregateVersion: input.expectedVersion + 1,
        eventType: "financing_offer.accepted",
        payload: { offerId: input.offerId, status: "ACCEPTED" },
      },
      mutate: async (transaction) => {
        const repository = new PostgresOfferRepository(transaction.database);
        const offer = await repository.findById(this.context.tenantId, input.offerId);
        if (offer === null) throw new Error("Financing offer is unavailable.");
        const accepted = acceptFinancingOffer(offer, {
          expectedVersion: input.expectedVersion,
          acceptedTermsHash: input.acceptedTermsHash,
          sellerAuthorized: input.sellerAuthorized,
          now: now().toISOString(),
        });
        await repository.update(this.context.tenantId, accepted, input.expectedVersion);
        return accepted;
      },
    });
  }
}
