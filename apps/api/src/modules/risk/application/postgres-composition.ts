import type { JejakDatabase } from "../../../db/client.js";
import type { TransactionActorContext } from "../../../db/context.js";
import { CanonicalSnapshotRiskFeatureProjector } from "../adapters/canonical-snapshot-features.js";
import { PostgresDurableRiskEvaluationCommitter } from "../adapters/postgres-durable-committer.js";
import { PostgresRiskEvaluationInputProvider } from "../adapters/postgres-input-provider.js";
import { PostgresRiskOperationJournal } from "../adapters/postgres-operation-journal.js";
import type { RiskEvaluationClient } from "../ports/client.js";
import type { RiskFeatureProjector, RiskPostEvaluationLifecycle, SellerSubjectHasher } from "../ports/durable-operation.js";
import { RiskEvaluationWorkerService } from "./risk-evaluation-worker.js";

export function createPostgresRiskEvaluationWorker(input: {
  actorContext: TransactionActorContext;
  client: RiskEvaluationClient;
  database: JejakDatabase;
  featureProjector?: RiskFeatureProjector;
  leaseMs?: number;
  maxAttempts?: number;
  now?: () => Date;
  policyVersion: string;
  postEvaluation?: RiskPostEvaluationLifecycle;
  sellerSubjectHasher: SellerSubjectHasher;
  sleep?: (attempt: number) => Promise<void>;
}): RiskEvaluationWorkerService {
  const idsAndClock = {
    ...(input.now === undefined ? {} : { now: input.now }),
  };
  return new RiskEvaluationWorkerService(
    {
      client: input.client,
      committer: new PostgresDurableRiskEvaluationCommitter(
        input.database,
        input.actorContext,
        idsAndClock,
      ),
      inputProvider: new PostgresRiskEvaluationInputProvider(
        input.database,
        {
          featureProjector: input.featureProjector ?? new CanonicalSnapshotRiskFeatureProjector(),
          policyVersion: input.policyVersion,
          sellerSubjectHasher: input.sellerSubjectHasher,
        },
        input.actorContext,
      ),
      journal: new PostgresRiskOperationJournal(input.database, input.actorContext, idsAndClock),
      ...(input.postEvaluation === undefined ? {} : { postEvaluation: input.postEvaluation }),
    },
    {
      ...(input.leaseMs === undefined ? {} : { leaseMs: input.leaseMs }),
      ...(input.maxAttempts === undefined ? {} : { maxAttempts: input.maxAttempts }),
      ...(input.now === undefined ? {} : { now: input.now }),
      ...(input.sleep === undefined ? {} : { sleep: input.sleep }),
    },
  );
}
