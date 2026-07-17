import { and, desc, eq, gt, isNotNull, isNull, or } from "drizzle-orm";
import { createHash } from "node:crypto";

import type { JejakDatabase } from "../../../db/client.js";
import { withTenantTransaction } from "../../../db/context.js";
import {
  claims,
  controlEvidence,
  eligibilityAttestations,
  financingOffers,
} from "../../../db/schema/domain.js";
import { canonicalHash } from "../../../reliability/canonical-json.js";
import type { PromotedTestnetManifest } from "../../../runtime/stellar/manifest.js";
import { FundingSagaError } from "../domain/errors.js";
import type { FundingFactsSource, FundingServerFacts } from "../application/build-funding-context.js";

/** Builds every privileged funding field from tenant-scoped records and the promoted manifest. */
export class PostgresFundingFactsSource implements FundingFactsSource {
  constructor(private readonly dependencies: {
    database: JejakDatabase;
    firstLossAmountMinor: string;
    manifest: PromotedTestnetManifest;
    nextId?: () => string;
    now?: () => Date;
  }) {}

  load(input: Parameters<FundingFactsSource["load"]>[0]): Promise<FundingServerFacts> {
    const now = (this.dependencies.now ?? (() => new Date()))();
    const stableId = (label: string) => this.dependencies.nextId?.() ?? deterministicUuidV7(canonicalHash({
      claimId: input.claimId,
      idempotencyKey: input.idempotencyKey,
      label,
      offerId: input.offerId,
      tenantId: input.tenantId,
    }));
    return withTenantTransaction(this.dependencies.database, {
      actorId: input.actorId,
      requestId: input.actorId,
      tenantId: input.tenantId,
    }, async (database) => {
      const [claim] = await database.select().from(claims).where(and(
        eq(claims.tenantId, input.tenantId),
        eq(claims.id, input.claimId),
      )).limit(1);
      if (claim === undefined || !["CONTROLLED", "ISSUED"].includes(claim.state)) {
        throw new FundingSagaError("INVALID_STATE_TRANSITION", "Claim must be CONTROLLED or ISSUED before funding.");
      }
      if (claim.version !== input.expectedClaimVersion) {
        throw new FundingSagaError("INVALID_STATE_TRANSITION", "Claim version does not match If-Match.");
      }

      const [offer] = await database.select().from(financingOffers).where(and(
        eq(financingOffers.tenantId, input.tenantId),
        eq(financingOffers.id, input.offerId),
        eq(financingOffers.claimId, input.claimId),
        eq(financingOffers.status, "ACCEPTED"),
        gt(financingOffers.expiresAt, now),
      )).limit(1);
      const [attestation] = await database.select().from(eligibilityAttestations).where(and(
        eq(eligibilityAttestations.tenantId, input.tenantId),
        eq(eligibilityAttestations.claimId, input.claimId),
        eq(eligibilityAttestations.status, "ACTIVE"),
        gt(eligibilityAttestations.expiresAt, now),
      )).orderBy(desc(eligibilityAttestations.updatedAt)).limit(1);
      const [evidence] = await database.select().from(controlEvidence).where(and(
        eq(controlEvidence.tenantId, input.tenantId),
        eq(controlEvidence.claimId, input.claimId),
        eq(controlEvidence.status, "VERIFIED"),
        isNotNull(controlEvidence.documentSecretRef),
        or(isNull(controlEvidence.expiresAt), gt(controlEvidence.expiresAt, now)),
      )).orderBy(desc(controlEvidence.updatedAt)).limit(1);
      if (offer === undefined || attestation === undefined || evidence === undefined) {
        throw new FundingSagaError("INVALID_STATE_TRANSITION", "Accepted terms, active attestation, and verified control are required.");
      }

      const offerPayload = object(offer.canonicalPayload);
      const termsHash = hex(offerPayload.termsHash, "accepted offer terms hash");
      const resultHash = canonicalHash({ claimKey: claim.claimKey, offerId: offer.id, termsHash });
      const operationId = stableId("operation");
      const facilityPositionId = stableId("facility-position");
      const commonEnvelope = {
        claimKey: claim.claimKey,
        facilityId: this.dependencies.manifest.configuration.facilityId,
        offerId: offer.id,
        principal: offer.principalAmountMinor,
        termsHash,
      };
      const issueEnvelopeHash = canonicalHash({ ...commonEnvelope, action: "ISSUE" });
      const fundEnvelopeHash = canonicalHash({ ...commonEnvelope, action: "FUND" });
      const compensationEnvelopeHash = canonicalHash({ ...commonEnvelope, action: "COMPENSATE" });
      return {
        chainIntent: {
          acceptedTermsHash: termsHash,
          assetControllerContractId: this.dependencies.manifest.contracts.asset_controller,
          attestationEnvelopeHash: hex(attestation.envelopeHash, "attestation envelope hash"),
          attestationId: attestation.id,
          claimKey: hex(claim.claimKey, "claim key"),
          controlEvidenceHash: hex(evidence.evidenceHash, "control evidence hash"),
          controlEvidenceId: evidence.id,
          facilityContractId: this.dependencies.manifest.contracts.facility,
          facilityHolder: this.dependencies.manifest.roles.treasury_holder,
          facilityId: this.dependencies.manifest.configuration.facilityId,
          facilityOperator: this.dependencies.manifest.roles.facility_operator,
          facilityTreasury: this.dependencies.manifest.roles.treasury_holder,
          firstLossAmountMinor: this.dependencies.firstLossAmountMinor,
          issuerOperator: this.dependencies.manifest.roles.issuer_operator,
          payoutReference: canonicalHash({ claimId: claim.id, facilityPositionId, kind: "DEMO_ANCHOR_PAYOUT" }),
          resultHash,
          sellerPayoutAccount: this.dependencies.manifest.roles.seller_payout,
        },
        chainMode: "SEPARATE",
        claimId: claim.id,
        compensationEnvelopeHash,
        facilityPositionId,
        fundEnvelopeHash,
        issueEnvelopeHash,
        issuerTransaction: {
          amountMinor: offer.principalAmountMinor,
          assetCode: "JCLAIM",
          claimId: claim.id,
          destination: this.dependencies.manifest.roles.treasury_holder,
          envelopeHash: issueEnvelopeHash,
          networkPassphrase: this.dependencies.manifest.network.passphrase,
          operation: "ISSUE",
          sequence: String(claim.version),
          source: this.dependencies.manifest.roles.issuer_operator,
        },
        network: this.dependencies.manifest.network.passphrase,
        operationId,
        offerId: offer.id,
        tenantId: input.tenantId,
      };
    });
  }
}

function object(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function hex(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) {
    throw new FundingSagaError("VALIDATION_FAILED", `${label} must be lowercase 32-byte hex.`);
  }
  return value;
}

function deterministicUuidV7(seed: string): string {
  const bytes = createHash("sha256").update(seed).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hexValue = bytes.toString("hex");
  return `${hexValue.slice(0, 8)}-${hexValue.slice(8, 12)}-${hexValue.slice(12, 16)}-${hexValue.slice(16, 20)}-${hexValue.slice(20)}`;
}
