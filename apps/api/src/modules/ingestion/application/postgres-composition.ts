import type { JejakDatabase } from "../../../db/client.js";
import {
  withTenantTransaction,
  type TransactionActorContext,
} from "../../../db/context.js";
import { MutationCoordinator } from "../../../reliability/mutation-coordinator.js";
import {
  PostgresMutationUnitOfWork,
  type PostgresMutationTransaction,
} from "../../../reliability/postgres-mutation-unit.js";
import { PostgresIngestionRepository } from "../adapters/postgres-repository.js";
import type { CsvLimits } from "../domain/canonical-csv.js";
import {
  CsvIngestionApplication,
  type IngestionCommandContext,
} from "./csv-ingestion-application.js";
import type {
  CsvObjectReader,
  IngestionView,
  PersistedIngestionResult,
} from "./ingest-csv.js";
import { MarketplaceSyncApplication } from "./marketplace-sync-application.js";
import type { MarketplaceAdapter } from "../ports/marketplace-adapter.js";

export function createPostgresCsvIngestionApplication(input: {
  context: IngestionCommandContext;
  database: JejakDatabase;
  limits?: Partial<CsvLimits>;
  nextId?: () => string;
  now?: () => Date;
  reader: CsvObjectReader;
}): CsvIngestionApplication<PostgresMutationTransaction<PersistedIngestionResult>> {
  const unit = new PostgresMutationUnitOfWork<PersistedIngestionResult>(
    input.database,
    input.context,
    {
      ...(input.nextId === undefined ? {} : { nextId: input.nextId }),
      ...(input.now === undefined ? {} : { now: input.now }),
    },
  );
  return new CsvIngestionApplication({
    context: input.context,
    coordinator: new MutationCoordinator(unit),
    ...(input.limits === undefined ? {} : { limits: input.limits }),
    reader: input.reader,
    repository: (transaction, sourceNamespace) =>
      new PostgresIngestionRepository(transaction.database, {
        ...(input.nextId === undefined ? {} : { nextId: input.nextId }),
        ...(input.now === undefined ? {} : { now: input.now }),
        sourceNamespace,
      }),
  });
}

export function createPostgresMarketplaceSyncApplication(input: {
  adapter: MarketplaceAdapter;
  context: IngestionCommandContext;
  database: JejakDatabase;
  nextId?: () => string;
  now?: () => Date;
}): MarketplaceSyncApplication<PostgresMutationTransaction<PersistedIngestionResult>> {
  const unit = new PostgresMutationUnitOfWork<PersistedIngestionResult>(
    input.database,
    input.context,
    {
      ...(input.nextId === undefined ? {} : { nextId: input.nextId }),
      ...(input.now === undefined ? {} : { now: input.now }),
    },
  );
  return new MarketplaceSyncApplication({
    adapter: input.adapter,
    context: input.context,
    coordinator: new MutationCoordinator(unit),
    repository: (transaction, repositoryInput) =>
      new PostgresIngestionRepository(transaction.database, {
        marketplaceConnectionId: repositoryInput.marketplaceConnectionId,
        ...(input.nextId === undefined ? {} : { nextId: input.nextId }),
        ...(input.now === undefined ? {} : { now: input.now }),
        sourceNamespace: repositoryInput.sourceNamespace,
      }),
  });
}

export function findPostgresIngestion(input: {
  context: TransactionActorContext;
  database: JejakDatabase;
  ingestionId: string;
}): Promise<IngestionView | null> {
  return withTenantTransaction(input.database, input.context, (transaction) =>
    new PostgresIngestionRepository(transaction, { sourceNamespace: "CSV" }).findById(
      input.context.tenantId,
      input.ingestionId,
    ),
  );
}
