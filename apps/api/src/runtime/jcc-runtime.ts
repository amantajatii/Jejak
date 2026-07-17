import type { IdentityVerifier } from "../auth/jwt-verifier.js";
import { findActiveMembership, findActiveResourceAssignments } from "../auth/membership-repository.js";
import type { AppConfig } from "../config/env.js";
import type { JejakDatabase } from "../db/client.js";
import type { TransactionActorContext } from "../db/context.js";
import { EnvironmentJccVerifier } from "../modules/jcc/adapters/environment-verifier.js";
import { PostgresEligibilityRegistryReconciler } from "../modules/jcc/adapters/postgres-registry-reconciler.js";
import {
  createEligibilityRegistryWriter,
  oracleAddressFromSecret,
} from "../modules/jcc/adapters/eligibility-registry-writer.js";
import { HttpJccSigner } from "../modules/jcc/adapters/http-signer.js";
import { createPostgresJccApplication } from "../modules/jcc/application/postgres-composition.js";
import { createJccRouteDependencies } from "../modules/jcc/compose.js";
import type { JccRouteDependencies } from "../modules/jcc/routes.js";
import {
  EnvironmentSellerSubjectHasher,
  JccRiskPostEvaluationLifecycle,
  PostgresEligibleRiskActivationCommitter,
  type RiskPostEvaluationLifecycle,
} from "../modules/risk/index.js";
import type { PromotedTestnetManifest } from "./stellar/manifest.js";

type SecretReferenceResolver = { resolve(reference: string): Promise<string | undefined> };

export type JccRuntime = {
  createRiskPostEvaluation(actorContext: TransactionActorContext): RiskPostEvaluationLifecycle;
  routeDependencies: JccRouteDependencies;
};

/**
 * Builds the ORACLE-only JCC registration route dependencies when — and only
 * when — every required piece is configured: TESTNET mode, the oracle signing
 * secret, the canonical JCC signer, the public-key registry, and the seller
 * subject salt. Returns undefined (route stays unregistered) otherwise, so a
 * partially configured deployment never exposes a broken endpoint.
 */
export async function buildJccRouteDependencies(input: {
  config: AppConfig;
  database: JejakDatabase;
  manifest: PromotedTestnetManifest;
  secretReferences: SecretReferenceResolver;
  verifier: IdentityVerifier;
}): Promise<JccRouteDependencies | undefined> {
  return (await buildJccRuntime(input))?.routeDependencies;
}

/** Build the shared gated JCC boundary used by both HTTP and risk-worker flows. */
export async function buildJccRuntime(input: {
  config: AppConfig;
  database: JejakDatabase;
  manifest: PromotedTestnetManifest;
  secretReferences: SecretReferenceResolver;
  verifier: IdentityVerifier;
}): Promise<JccRuntime | undefined> {
  const { config } = input;
  if (
    config.chainMode !== "TESTNET" ||
    config.oracleSecretReference === undefined ||
    config.jccSignerUrl === undefined ||
    config.jccSignerTokenReference === undefined ||
    config.jccPublicKeyRegistryReference === undefined ||
    config.riskSellerSubjectSaltRef === undefined ||
    config.stellarRpcUrl === undefined
  ) {
    return undefined;
  }

  const oracleSecret = await input.secretReferences.resolve(config.oracleSecretReference);
  const signerToken = await input.secretReferences.resolve(config.jccSignerTokenReference);
  if (oracleSecret === undefined || signerToken === undefined) return undefined;

  let attestationVerifier: EnvironmentJccVerifier;
  try {
    attestationVerifier = await EnvironmentJccVerifier.fromReference(config.jccPublicKeyRegistryReference);
  } catch {
    return undefined;
  }

  const registry = createEligibilityRegistryWriter({
    contractId: input.manifest.contracts.eligibility_registry,
    networkPassphrase: input.manifest.network.passphrase,
    oracleSecret,
    rpcUrl: config.stellarRpcUrl,
  });

  const sellerSubjectHasher = new EnvironmentSellerSubjectHasher(
    config.riskSellerSubjectSaltRef,
  );
  const signer = new HttpJccSigner({
    baseUrl: config.jccSignerUrl,
    workloadToken: signerToken,
  });
  const routeDependencies = createJccRouteDependencies({
    attestationVerifier,
    auth: {
      findAssignments: (request) => findActiveResourceAssignments(input.database, request),
      findMembership: (request) => findActiveMembership(input.database, request),
      verifier: input.verifier,
    },
    database: input.database,
    network: "testnet",
    oracleAddress: oracleAddressFromSecret(oracleSecret),
    recovery: registry,
    registry,
    sandbox: config.partnerMode === "SANDBOX",
    sellerSubjectHasher,
    signer,
  });
  return {
    createRiskPostEvaluation: (actorContext) =>
      new JccRiskPostEvaluationLifecycle(
        {
          activator: new PostgresEligibleRiskActivationCommitter(
            input.database,
            actorContext,
          ),
          jcc: createPostgresJccApplication({
            actorContext,
            database: input.database,
            reconciler: new PostgresEligibilityRegistryReconciler(
              input.database,
              actorContext,
              "testnet",
            ),
            recovery: registry,
            registry,
            sellerSubjectHasher,
            signer,
            verifier: attestationVerifier,
          }),
        },
        {
          network: "testnet",
          oracle: oracleAddressFromSecret(oracleSecret),
          ttlMs: config.jccTtlMs,
        },
      ),
    routeDependencies,
  };
}
