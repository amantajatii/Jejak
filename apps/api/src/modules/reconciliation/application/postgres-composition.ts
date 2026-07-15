import { v7 as uuidv7 } from "uuid";

import type { JejakDatabase } from "../../../db/client.js";
import { withTenantTransaction, type TransactionActorContext } from "../../../db/context.js";
import { PostgresDecisionSnapshotRepository } from "../adapters/postgres-repository.js";
import {
  DecisionSnapshotApplication,
  type DecisionSnapshotUnitOfWork,
} from "./create-decision-snapshot.js";

export function createPostgresDecisionSnapshotApplication(input: {
  context: TransactionActorContext;
  database: JejakDatabase;
  featureSchemaVersion?: string;
  nextId?: () => string;
  now?: () => Date;
}): DecisionSnapshotApplication {
  const unitOfWork: DecisionSnapshotUnitOfWork = {
    transaction: (work) =>
      withTenantTransaction(input.database, input.context, (transaction) =>
        work(
          new PostgresDecisionSnapshotRepository(transaction, {
            ...(input.nextId === undefined ? {} : { nextId: input.nextId }),
          }),
        ),
      ),
  };
  return new DecisionSnapshotApplication(input.context, unitOfWork, {
    ...(input.featureSchemaVersion === undefined
      ? {}
      : { featureSchemaVersion: input.featureSchemaVersion }),
    nextId: input.nextId ?? uuidv7,
    now: input.now ?? (() => new Date()),
  });
}
