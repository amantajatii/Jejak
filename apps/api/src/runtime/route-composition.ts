import type { SupabaseJwtVerifier } from "../auth/jwt-verifier.js";
import {
  findActiveMembership,
  findActiveResourceAssignments,
} from "../auth/membership-repository.js";
import type { JejakDatabase } from "../db/client.js";
import { PostgresInvitationRepository } from "../invitations/postgres-repository.js";
import { InvitationService } from "../invitations/service.js";
import { ClaimLifecycleApplication } from "../modules/claims/application/claim-service.js";
import { FinancingOfferApplication } from "../modules/claims/application/offer-service.js";
import { PostgresClaimQueryRepository } from "../modules/claims/adapters/postgres-query-repository.js";
import type { ClaimRouteDependencies } from "../modules/claims/routes.js";
import type { EvidenceStorage } from "../modules/evidence/ports/evidence-storage.js";
import {
  createPostgresCsvIngestionApplication,
  createPostgresMarketplaceSyncApplication,
  DeterministicSandboxMarketplaceAdapter,
  findPostgresIngestion,
  StorageCsvObjectReader,
  type IngestionRouteDependencies,
} from "../modules/ingestion/index.js";
import {
  PostgresReadModelRepository,
  ReadModelService,
} from "../modules/read-model/index.js";
import type { InvitationRouteDependencies } from "../routes/invitations.js";
import type { ReadModelRouteDependencies } from "../routes/read-models.js";

export type RuntimeRouteDependencies = {
  claimDependencies: ClaimRouteDependencies;
  ingestionDependencies: IngestionRouteDependencies;
  invitationDependencies: InvitationRouteDependencies;
  readModelDependencies: ReadModelRouteDependencies;
};

export function createRuntimeRouteDependencies(input: {
  database: JejakDatabase;
  evidenceMaximumBytes: number;
  evidenceStorage: EvidenceStorage;
  verifier: SupabaseJwtVerifier;
}): RuntimeRouteDependencies {
  const queries = new PostgresClaimQueryRepository(input.database);
  const marketplace = new DeterministicSandboxMarketplaceAdapter({});
  const csvReader = new StorageCsvObjectReader(input.evidenceStorage, input.evidenceMaximumBytes);
  const findMembership: ClaimRouteDependencies["findMembership"] = (request) =>
    findActiveMembership(input.database, request);

  return {
    claimDependencies: {
      acceptOffer: (context, command) =>
        new FinancingOfferApplication(input.database, context).accept(command),
      analyzeClaim: (context, command) =>
        new ClaimLifecycleApplication(input.database, context).analyze(command),
      createClaim: (context, command) =>
        new ClaimLifecycleApplication(input.database, context).create(command),
      createOffer: (context, command) =>
        new FinancingOfferApplication(input.database, context).create(command),
      findAssignments: (request) => findActiveResourceAssignments(input.database, request),
      findClaim: (context, claimId) => queries.findClaim(context, claimId),
      findMembership,
      findSellerOwnedClaim: (context, authSubject, claimId) =>
        queries.findSellerOwnedClaim(context, authSubject, claimId),
      findSellerOwnedOffer: (context, authSubject, offerId) =>
        queries.findSellerOwnedOffer(context, authSubject, offerId),
      hasActiveOffer: (context, claimId) => queries.hasActiveOffer(context, claimId),
      listClaims: (context, query) => queries.listClaims(context, query),
      verifier: input.verifier,
    },
    ingestionDependencies: {
      findIngestion: (context, ingestionId) =>
        findPostgresIngestion({ context, database: input.database, ingestionId }),
      findMembership,
      ingestCsv: (context, command) =>
        createPostgresCsvIngestionApplication({
          context,
          database: input.database,
          reader: csvReader,
        }).ingest(command),
      syncMarketplace: (context, command) =>
        createPostgresMarketplaceSyncApplication({
          adapter: marketplace,
          context,
          database: input.database,
        }).sync(command),
      verifier: input.verifier,
    },
    invitationDependencies: {
      findMembership,
      service: new InvitationService(new PostgresInvitationRepository(input.database)),
      verifier: input.verifier,
    },
    readModelDependencies: {
      findMembership,
      serviceForActor: (actorId) =>
        new ReadModelService(new PostgresReadModelRepository(input.database, actorId)),
      verifier: input.verifier,
    },
  };
}
