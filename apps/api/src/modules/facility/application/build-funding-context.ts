import type { MoneyValue } from "../../shared/money.js";
import type { FundingChainIntent, FundingSagaContext } from "../domain/types.js";
import type { FacilityFundingRouteActor } from "../routes.js";

/** Facts are loaded only from authoritative tenant-scoped records/configuration. */
export type FundingServerFacts = {
  chainIntent: FundingChainIntent;
  chainMode: FundingSagaContext["chainMode"];
  claimId: string;
  compensationEnvelopeHash: string;
  facilityPositionId: string;
  fundEnvelopeHash: string;
  issueEnvelopeHash: string;
  issuerTransaction: FundingSagaContext["issuerTransaction"];
  network: string;
  operationId: string;
  offerId: string;
  tenantId: string;
};

export interface FundingFactsSource {
  load(input: {
    actorId: string;
    claimId: string;
    expectedClaimVersion: number;
    idempotencyKey: string;
    offerId: string;
    tenantId: string;
  }): Promise<FundingServerFacts>;
}

/**
 * Converts the two frozen FundClaim fields into a complete saga context. The
 * caller cannot supply offer terms, keys, control/attestation references,
 * identities, payout data, or contract configuration.
 */
export class ServerSideFundingContextBuilder {
  constructor(private readonly facts: FundingFactsSource) {}

  async build(input: FacilityFundingRouteActor & {
    claimId: string;
    expectedClaimVersion: number;
    maximumAmount: MoneyValue;
    offerId: string;
  }): Promise<FundingSagaContext> {
    const facts = await this.facts.load({
      actorId: input.actorId,
      claimId: input.claimId,
      expectedClaimVersion: input.expectedClaimVersion,
      idempotencyKey: input.idempotencyKey,
      offerId: input.offerId,
      tenantId: input.tenantId,
    });
    if (facts.claimId !== input.claimId || facts.offerId !== input.offerId || facts.tenantId !== input.tenantId) {
      throw new Error("Server-side funding facts do not bind the selected tenant, claim, and offer.");
    }
    if (facts.issuerTransaction.claimId !== input.claimId) {
      throw new Error("Server-side issuer transaction does not bind the funding claim.");
    }
    const { maximumAmount, ...route } = input;
    return {
      ...route,
      ...facts,
      source: maximumAmount,
    };
  }
}
