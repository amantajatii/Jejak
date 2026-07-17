import { v7 as uuidv7 } from "uuid";

import type { JejakDatabase } from "../../db/client.js";
import type { ClaimCommandAuthorizationDependencies } from "../control/routes.js";
import type { SellerSubjectHasher } from "../risk/ports/durable-operation.js";
import { PostgresEligibilityRegistryReconciler } from "./adapters/postgres-registry-reconciler.js";
import { createPostgresJccApplication } from "./application/postgres-composition.js";
import type {
  AttestationSigner,
  AttestationVerifier,
  JccRegistry,
  RegistrySubmissionRecovery,
} from "./ports/index.js";
import type { JccRouteDependencies } from "./routes.js";

/**
 * Composes the ORACLE-only JCC registration route dependencies. Each request
 * builds a tenant/actor-scoped JccApplicationService that signs the credential
 * (HTTP signer), registers it on the Stellar Testnet eligibility registry, and
 * reconciles against indexed chain events.
 */
export function createJccRouteDependencies(input: {
  attestationVerifier: AttestationVerifier;
  auth: ClaimCommandAuthorizationDependencies;
  database: JejakDatabase;
  network: string;
  oracleAddress: string;
  recovery: RegistrySubmissionRecovery;
  registry: JccRegistry;
  sandbox: boolean;
  sellerSubjectHasher: SellerSubjectHasher;
  signer: AttestationSigner;
}): JccRouteDependencies {
  return {
    ...input.auth,
    issue: (context, command) => {
      const application = createPostgresJccApplication({
        actorContext: context,
        database: input.database,
        reconciler: new PostgresEligibilityRegistryReconciler(input.database, context, input.network),
        recovery: input.recovery,
        registry: input.registry,
        sellerSubjectHasher: input.sellerSubjectHasher,
        signer: input.signer,
        verifier: input.attestationVerifier,
      });
      return application.issue({
        attestationId: command.attestationId,
        evaluationId: command.evaluationId,
        expiresAt: command.expiresAt,
        issuedAt: command.issuedAt,
        network: input.network,
        operationId: uuidv7(),
        oracle: input.oracleAddress,
        tenantId: context.tenantId,
      });
    },
    sandbox: input.sandbox,
  };
}
