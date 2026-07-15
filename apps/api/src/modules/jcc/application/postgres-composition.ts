import type { JejakDatabase } from "../../../db/client.js";
import type { TransactionActorContext } from "../../../db/context.js";
import type { SellerSubjectHasher } from "../../risk/ports/durable-operation.js";
import { PostgresJccEvidenceSource } from "../adapters/postgres-evidence-source.js";
import { PostgresJccRepository } from "../adapters/postgres-repository.js";
import { PostgresJccSubmissionJournal } from "../adapters/postgres-submission-journal.js";
import type {
  AttestationSigner,
  AttestationVerifier,
  JccRegistry,
  RegistryReconciler,
} from "../ports/index.js";
import { JccApplicationService } from "./jcc-service.js";

export function createPostgresJccApplication(input: {
  actorContext: TransactionActorContext;
  database: JejakDatabase;
  reconciler: RegistryReconciler;
  registry: JccRegistry;
  sellerSubjectHasher: SellerSubjectHasher;
  signer: AttestationSigner;
  verifier: AttestationVerifier;
}): JccApplicationService {
  return new JccApplicationService({
    evidenceSource: new PostgresJccEvidenceSource(
      input.database,
      input.sellerSubjectHasher,
      input.actorContext,
    ),
    journal: new PostgresJccSubmissionJournal(input.database, input.actorContext),
    reconciler: input.reconciler,
    registry: input.registry,
    repository: new PostgresJccRepository(input.database, { actorContext: input.actorContext }),
    signer: input.signer,
    verifier: input.verifier,
  });
}
