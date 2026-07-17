import type { FastifyRequest } from "fastify";

import { AssetController, ClaimLifecycle, Facility, ResolutionManager } from "@jejak/stellar-client";
import { canonicalHash } from "../reliability/canonical-json.js";

import { findActiveMembership, findActiveResourceAssignments } from "../auth/membership-repository.js";
import type { IdentityVerifier } from "../auth/jwt-verifier.js";
import type { AppConfig } from "../config/env.js";
import type { JejakDatabase } from "../db/client.js";
import {
  AnchorPayoutOrchestrator,
  DeterministicAnchorSandbox,
  PostgresAnchorPayoutJournal,
  type AnchorSandboxConfig,
} from "../modules/anchor/index.js";
import { authorizeAssignedClaimCommand } from "../modules/control/index.js";
import { createChainIndexer, StellarRpcAdapter } from "../modules/chain/index.js";
import {
  FacilityFundingSagaService,
  GeneratedStellarFundingChain,
  PostgresFundingFactsSource,
  PostgresFundingSagaRepository,
  ServerSideFundingContextBuilder,
  type FacilityFundingRouteDependencies,
} from "../modules/facility/index.js";
import {
  DeterministicIssuerSandbox,
  IssuerApprovalOrchestrator,
  PostgresIssuerOperationJournal,
  PostgresTestnetIssuerIssueService,
  type IssuerIssueRouteDependencies,
} from "../modules/issuer/index.js";
import {
  GeneratedWaterfallSubmitter,
  PostgresSettlementClaimVersionGuard,
  PostgresSettlementJournal,
  SettlementService,
  type SettlementRouteDependencies,
} from "../modules/settlement/index.js";
import {
  PostgresResolutionRepository,
  PostgresTestnetResolutionRepository,
  ResolutionService,
  type ResolutionRouteDependencies,
} from "../modules/resolution/index.js";
import type { PromotedTestnetManifest } from "./stellar/manifest.js";
import { GeneratedLifecycleResolutionActions } from "./stellar/lifecycle-resolution.js";
import { TestnetHappyClaimFinalizer } from "./stellar/happy-finalizer.js";
import { NodeRoleSigner } from "./stellar/node-role-signer.js";

type SecretReferenceResolver = { resolve(reference: string): Promise<string | undefined> };

export type TestnetActionRuntime = {
  finalizeRepaidClaims(input: { actorId: string; tenantId: string }): Promise<number>;
  facilityFundingDependencies: FacilityFundingRouteDependencies;
  issuerIssueDependencies: IssuerIssueRouteDependencies;
  resolutionDependencies: ResolutionRouteDependencies;
  settlementDependencies: SettlementRouteDependencies;
  signers: {
    facilityOperator: NodeRoleSigner;
    issuerOperator: NodeRoleSigner;
    originatorControl: NodeRoleSigner;
    resolver: NodeRoleSigner;
    servicer: NodeRoleSigner;
    treasuryHolder: NodeRoleSigner;
  };
};

/**
 * Fail-closed HTTP composition for signed Testnet issue/fund actions. A missing,
 * invalid, or manifest-mismatched role secret leaves every action route absent.
 */
export async function buildTestnetActionRuntime(input: {
  config: AppConfig;
  database: JejakDatabase;
  manifest: PromotedTestnetManifest;
  secretReferences: SecretReferenceResolver;
  verifier: IdentityVerifier;
}): Promise<TestnetActionRuntime | undefined> {
  const { config } = input;
  if (
    config.chainMode !== "TESTNET" ||
    config.stellarRpcUrl === undefined ||
    config.originatorControlSecretReference === undefined ||
    config.issuerOperatorSecretReference === undefined ||
    config.facilityOperatorSecretReference === undefined ||
    config.treasuryHolderSecretReference === undefined
    || config.servicerSecretReference === undefined
    || config.resolverSecretReference === undefined
    || config.stellarSourcePublicKey === undefined
  ) return undefined;

  const [originatorSecret, issuerSecret, facilitySecret, treasurySecret, servicerSecret, resolverSecret] = await Promise.all([
    input.secretReferences.resolve(config.originatorControlSecretReference),
    input.secretReferences.resolve(config.issuerOperatorSecretReference),
    input.secretReferences.resolve(config.facilityOperatorSecretReference),
    input.secretReferences.resolve(config.treasuryHolderSecretReference),
    input.secretReferences.resolve(config.servicerSecretReference),
    input.secretReferences.resolve(config.resolverSecretReference),
  ]);
  if (originatorSecret === undefined || issuerSecret === undefined || facilitySecret === undefined || treasurySecret === undefined || servicerSecret === undefined || resolverSecret === undefined) {
    return undefined;
  }

  let originatorControl: NodeRoleSigner;
  let issuerOperator: NodeRoleSigner;
  let facilityOperator: NodeRoleSigner;
  let treasuryHolder: NodeRoleSigner;
  let servicer: NodeRoleSigner;
  let resolver: NodeRoleSigner;
  try {
    const signer = (secret: string, expectedPublicKey: string) => NodeRoleSigner.fromSecret({
      expectedPublicKey,
      networkPassphrase: input.manifest.network.passphrase,
      secret,
    });
    originatorControl = signer(originatorSecret, input.manifest.roles.originator_control);
    issuerOperator = signer(issuerSecret, input.manifest.roles.issuer_operator);
    facilityOperator = signer(facilitySecret, input.manifest.roles.facility_operator);
    treasuryHolder = signer(treasurySecret, input.manifest.roles.treasury_holder);
    servicer = signer(servicerSecret, input.manifest.roles.servicer);
    resolver = signer(resolverSecret, input.manifest.roles.resolver);
  } catch {
    return undefined;
  }

  const originatorCommon = {
    networkPassphrase: input.manifest.network.passphrase,
    publicKey: originatorControl.publicKey,
    rpcUrl: config.stellarRpcUrl,
    signTransaction: originatorControl.signTransaction,
  };
  const issuerCommon = {
    networkPassphrase: input.manifest.network.passphrase,
    publicKey: issuerOperator.publicKey,
    rpcUrl: config.stellarRpcUrl,
    signTransaction: issuerOperator.signTransaction,
  };
  const assetController = new AssetController.Client({
      ...issuerCommon,
      contractId: input.manifest.contracts.asset_controller,
  });
  const issueService = new PostgresTestnetIssuerIssueService({
    assetController,
    claimLifecycle: new ClaimLifecycle.Client({
      ...originatorCommon,
      contractId: input.manifest.contracts.claim_lifecycle,
    }),
    database: input.database,
    issuerSigner: issuerOperator,
    manifest: input.manifest,
    originatorSigner: originatorControl,
  });

  const fundingChain = new GeneratedStellarFundingChain({
    assetControllerContractId: input.manifest.contracts.asset_controller,
    assetPublicKey: issuerOperator.publicKey,
    assetSignTransaction: issuerOperator.signTransaction,
    facilityContractId: input.manifest.contracts.facility,
    facilityPublicKey: facilityOperator.publicKey,
    facilitySignTransaction: facilityOperator.signTransaction,
    lookup: { find: async () => null },
    mode: "PRODUCTION",
    networkPassphrase: input.manifest.network.passphrase,
    rpcUrl: config.stellarRpcUrl,
    submitter: {
      submit: async ({ action, transaction }) => action === "FUND"
        ? facilityOperator.submit(transaction, [treasuryHolder])
        : issuerOperator.submit(transaction, action === "COMPENSATE" ? [treasuryHolder] : []),
    },
  });
  const facilityClient = new Facility.Client({
    contractId: input.manifest.contracts.facility,
    networkPassphrase: input.manifest.network.passphrase,
    publicKey: facilityOperator.publicKey,
    rpcUrl: config.stellarRpcUrl,
    signTransaction: facilityOperator.signTransaction,
  });
  const fundingRepository = new PostgresFundingSagaRepository(input.database);
  const issuerApproval = new IssuerApprovalOrchestrator(
    new DeterministicIssuerSandbox(),
    new PostgresIssuerOperationJournal(input.database),
  );
  const anchorConfig: AnchorSandboxConfig = {
    feeBps: 50,
    rateDenominator: "1",
    rateNumerator: "16000",
    sourceCurrency: "JUSD",
    sourceScale: input.manifest.assets.JUSD.scale,
    targetCurrency: "TIDR",
    targetIssuer: "SANDBOX",
    targetScale: 2,
  };
  const anchor = new AnchorPayoutOrchestrator(
    new DeterministicAnchorSandbox({ config: anchorConfig }),
    new PostgresAnchorPayoutJournal(input.database),
    anchorConfig,
  );
  const funding = new FacilityFundingSagaService(fundingRepository, issuerApproval, fundingChain, anchor);
  const fundingContext = new ServerSideFundingContextBuilder(new PostgresFundingFactsSource({
    database: input.database,
    firstLossAmountMinor: config.testnetFirstLossBaseUnits ?? "100000000",
    manifest: input.manifest,
  }));
  const auth = {
    findAssignments: (request: Parameters<typeof findActiveResourceAssignments>[1]) => findActiveResourceAssignments(input.database, request),
    findMembership: (request: Parameters<typeof findActiveMembership>[1]) => findActiveMembership(input.database, request),
    verifier: input.verifier,
  };
  const settlementJournal = new PostgresSettlementJournal(input.database, { network: "testnet" });
  const waterfallSubmitter = new GeneratedWaterfallSubmitter({
    contractId: input.manifest.contracts.servicing_waterfall,
    networkPassphrase: input.manifest.network.passphrase,
    publicKey: servicer.publicKey,
    rpcUrl: config.stellarRpcUrl,
    signTransaction: servicer.signTransaction,
    signer: {
      submit: async ({ resultHash, transaction }) => {
        const receipt = await servicer.submit(transaction);
        return {
          envelopeHash: canonicalHash({ resultHash, transactionHash: receipt.transactionHash }),
          ...(receipt.ledgerSequence === undefined ? {} : { ledgerSequence: receipt.ledgerSequence }),
          transactionHash: receipt.transactionHash,
        };
      },
    },
  });
  const settlement = new SettlementService({
    canonicalEvents: settlementJournal,
    journal: settlementJournal,
    servicerAddress: servicer.publicKey,
    submitter: waterfallSubmitter,
  });
  const settlementVersion = new PostgresSettlementClaimVersionGuard(input.database);
  const resolverCommon = {
    networkPassphrase: input.manifest.network.passphrase,
    publicKey: resolver.publicKey,
    rpcUrl: config.stellarRpcUrl,
    signTransaction: resolver.signTransaction,
  };
  const resolutionActions = new GeneratedLifecycleResolutionActions({
    claimLifecycle: new ClaimLifecycle.Client({
      ...resolverCommon,
      contractId: input.manifest.contracts.claim_lifecycle,
    }),
    resolutionManager: new ResolutionManager.Client({
      ...resolverCommon,
      contractId: input.manifest.contracts.resolution_manager,
    }),
    submitter: { submit: ({ transaction }) => resolver.submit(transaction) },
  });
  const postgresResolution = new PostgresResolutionRepository(input.database, {
    resolverAddress: resolver.publicKey,
  });
  const resolution = new ResolutionService(
    new PostgresTestnetResolutionRepository({
      actions: resolutionActions,
      assetController,
      database: input.database,
      delegate: postgresResolution,
      issuerSigner: issuerOperator,
      manifest: input.manifest,
    }),
    // The wrapped repository blocks its DB commit until the generated transaction
    // reaches SUCCESS; the canonical indexer then projects the same terminal state.
    { isCloseReconciled: async () => true },
  );
  const happyFinalizer = new TestnetHappyClaimFinalizer({
    assetController,
    database: input.database,
    facility: facilityClient,
    facilitySigner: facilityOperator,
    issuerSigner: issuerOperator,
    manifest: input.manifest,
    treasurySigner: treasuryHolder,
  });

  return {
    finalizeRepaidClaims: (context) => happyFinalizer.finalizeRepaidClaims(context),
    facilityFundingDependencies: {
      authorizeFacility: (request, claimId) => authorizeRoute(request, claimId, "FACILITY", auth),
      buildFundingContext: (context) => fundingContext.build(context),
      execute: (context) => funding.execute(context),
    },
    issuerIssueDependencies: {
      authorizeIssuer: (request, claimId) => authorizeRoute(request, claimId, "ISSUER", auth),
      buildIssueContext: (context) => issueService.buildContext(context),
      execute: (context) => issueService.execute(context),
    },
    resolutionDependencies: {
      ...auth,
      sandbox: true,
      service: resolution,
    },
    settlementDependencies: {
      ...auth,
      reconciliation: {
        reconcile: async (reconciliationInput) => {
          await settlementVersion.assertCurrent({
            claimId: reconciliationInput.claimId,
            context: reconciliationInput.context,
            expectedVersion: reconciliationInput.expectedVersion,
          });
          const latestLedger = await new StellarRpcAdapter({ rpcUrl: config.stellarRpcUrl!, timeoutMs: 20_000 }).getLatestLedger();
          const indexer = createChainIndexer({
            contracts: input.manifest.contracts,
            database: input.database,
            fundingAsset: {
              currency: "JUSD",
              issuer: input.manifest.assets.JUSD.issuer,
              scale: input.manifest.assets.JUSD.scale,
            },
            initialLedger: Math.max(1, latestLedger - 100),
            networkPassphrase: input.manifest.network.passphrase,
            publicKey: config.stellarSourcePublicKey!,
            rpcUrl: config.stellarRpcUrl!,
            workerActorId: reconciliationInput.context.actorId,
          });
          const indexed = await indexer.index({ tenantId: reconciliationInput.context.tenantId });
          const reconciliation = await indexer.reconcile({ tenantId: reconciliationInput.context.tenantId });
          return {
            claimId: reconciliationInput.claimId,
            indexed,
            reconciliation,
            through: reconciliationInput.through,
          };
        },
      },
      sandbox: true,
      service: settlement,
    },
    signers: { facilityOperator, issuerOperator, originatorControl, resolver, servicer, treasuryHolder },
  };
}

async function authorizeRoute(
  request: FastifyRequest,
  claimId: string,
  role: "FACILITY" | "ISSUER",
  dependencies: Parameters<typeof authorizeAssignedClaimCommand>[1],
) {
  const authorization = await authorizeAssignedClaimCommand(request, dependencies, claimId, [role]);
  const idempotencyKey = request.headers["idempotency-key"];
  if (typeof idempotencyKey !== "string" || idempotencyKey.length < 16 || idempotencyKey.length > 255) {
    throw new Error("A valid Idempotency-Key header is required.");
  }
  const correlation = request.headers["x-correlation-id"];
  return {
    actorId: authorization.actorId,
    correlationId: typeof correlation === "string" && correlation.length > 0 ? correlation : request.id,
    idempotencyKey,
    requestId: request.id,
    requestedAt: new Date().toISOString(),
    tenantId: authorization.tenantId,
  };
}
