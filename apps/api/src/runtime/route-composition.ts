import type { IdentityVerifier } from "../auth/jwt-verifier.js";
import {
  findActiveMembership,
  findActiveResourceAssignments,
} from "../auth/membership-repository.js";
import type { JejakDatabase } from "../db/client.js";
import { PostgresInvitationRepository } from "../invitations/postgres-repository.js";
import { InvitationService } from "../invitations/service.js";
import { ChainStateReadService } from "../modules/chain/application/read-chain-state.js";
import type { StellarStateReaderPort } from "../modules/chain/ports/stellar-rpc.js";
import { ClaimLifecycleApplication } from "../modules/claims/application/claim-service.js";
import { FinancingOfferApplication } from "../modules/claims/application/offer-service.js";
import { PostgresClaimQueryRepository } from "../modules/claims/adapters/postgres-query-repository.js";
import type { ClaimRouteDependencies } from "../modules/claims/routes.js";
import {
  ClaimControlCommandService,
  PostgresControlCommandRepository,
  type ControlRouteDependencies,
} from "../modules/control/index.js";
import type { EvidenceStorage } from "../modules/evidence/ports/evidence-storage.js";
import {
  DemoResetService,
  PostgresDemoResetRepository,
  type DemoIdentityIssuer,
  type DemoRouteDependencies,
} from "../modules/demo/index.js";
import { PostgresRefundSpikeRepository } from "../modules/demo/postgres-refund-spike-repository.js";
import { RefundSpikeService } from "../modules/demo/refund-spike-service.js";
import type { RefundSpikeRouteDependencies } from "../modules/demo/refund-spike-routes.js";
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
import {
  PostgresResolutionRepository,
  ResolutionService,
  type ResolutionReconciliationPort,
  type ResolutionRouteDependencies,
} from "../modules/resolution/index.js";
import type {
  ClaimWorkspaceConfiguration,
  WorkspaceRouteDependencies,
} from "../modules/workspace/index.js";
import type { InvitationRouteDependencies } from "../routes/invitations.js";
import type { ReadModelRouteDependencies } from "../routes/read-models.js";

export type RuntimeRouteDependencies = {
  claimDependencies: ClaimRouteDependencies;
  controlDependencies: ControlRouteDependencies;
  demoDependencies?: DemoRouteDependencies;
  ingestionDependencies: IngestionRouteDependencies;
  invitationDependencies: InvitationRouteDependencies;
  readModelDependencies: ReadModelRouteDependencies;
  refundSpikeDependencies?: RefundSpikeRouteDependencies;
  resolutionDependencies?: ResolutionRouteDependencies;
  workspaceDependencies?: WorkspaceRouteDependencies;
};

export function createRuntimeRouteDependencies(input: {
  chainStateReader?: StellarStateReaderPort;
  database: JejakDatabase;
  evidenceMaximumBytes: number;
  evidenceStorage: EvidenceStorage;
  demoIdentityIssuer?: DemoIdentityIssuer;
  onDemoReset?: (context: Awaited<ReturnType<DemoResetService["reset"]>>) => Promise<void> | void;
  partnerMode: "SANDBOX" | "PRODUCTION";
  resolution?: {
    reconciliation: ResolutionReconciliationPort;
    resolverAddress: string;
  };
  verifier: IdentityVerifier;
  workspace?: ClaimWorkspaceConfiguration;
}): RuntimeRouteDependencies {
  const queries = new PostgresClaimQueryRepository(input.database);
  const marketplace = new DeterministicSandboxMarketplaceAdapter({});
  const csvReader = new StorageCsvObjectReader(input.evidenceStorage, input.evidenceMaximumBytes);
  const demoReset = new DemoResetService(new PostgresDemoResetRepository(input.database));
  const findMembership: ClaimRouteDependencies["findMembership"] = (request) =>
    findActiveMembership(input.database, request);
  const findAssignments: ControlRouteDependencies["findAssignments"] = (request) =>
    findActiveResourceAssignments(input.database, request);
  const authorization = {
    findAssignments,
    findMembership,
    verifier: input.verifier,
  };
  const controlService = new ClaimControlCommandService(
    new PostgresControlCommandRepository(input.database, { mode: input.partnerMode }),
  );
  const chainStateService = input.chainStateReader === undefined
    ? undefined
    : new ChainStateReadService(input.chainStateReader);

  return {
    ...(input.demoIdentityIssuer === undefined ? {} : {
      demoDependencies: {
        createSession: ({ role, tenantId }) => input.demoIdentityIssuer!.issue({ role, tenantId }),
        getContext: (tenantId) => demoReset.getContext(tenantId),
        reset: async (request) => {
          const context = await demoReset.reset(request);
          await input.onDemoReset?.(context);
          return context;
        },
      },
    }),
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
      ...(chainStateService === undefined
        ? {}
        : { readChainState: (claimKey: string) => chainStateService.readClaimChainState(claimKey) }),
      verifier: input.verifier,
    },
    controlDependencies: {
      ...authorization,
      sandbox: input.partnerMode === "SANDBOX",
      service: controlService,
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
    ...(input.demoIdentityIssuer === undefined
      ? {}
      : {
          refundSpikeDependencies: {
            ...authorization,
            sandbox: true,
            service: new RefundSpikeService(new PostgresRefundSpikeRepository(input.database)),
          },
        }),
    ...(input.resolution === undefined
      ? {}
      : {
          resolutionDependencies: {
            ...authorization,
            sandbox: input.partnerMode === "SANDBOX",
            service: new ResolutionService(
              new PostgresResolutionRepository(input.database, {
                resolverAddress: input.resolution.resolverAddress,
              }),
              input.resolution.reconciliation,
            ),
          },
        }),
    ...(input.workspace === undefined
      ? {}
      : {
          workspaceDependencies: {
            config: input.workspace,
            database: input.database,
            sandbox: input.workspace.sandbox,
            verifier: input.verifier,
          },
        }),
  };
}
