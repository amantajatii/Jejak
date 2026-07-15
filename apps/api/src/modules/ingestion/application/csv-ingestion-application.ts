import type { TransactionActorContext } from "../../../db/context.js";
import {
  MutationCoordinator,
  type MutationScope,
  type MutationTransaction,
} from "../../../reliability/mutation-coordinator.js";
import type { CsvLimits } from "../domain/canonical-csv.js";
import {
  readCanonicalCsv,
  type CsvObjectReader,
  type IngestionRepository,
  type PersistedIngestionResult,
} from "./ingest-csv.js";

export type IngestionCommandContext = TransactionActorContext & {
  idempotencyKey: string;
};

export function csvSourceNamespace(sellerId: string): string {
  return `JEJAK_CANONICAL_CSV_V1:${sellerId}`;
}

export class CsvIngestionApplication<
  TTransaction extends MutationTransaction<PersistedIngestionResult>,
> {
  constructor(
    private readonly dependencies: {
      context: IngestionCommandContext;
      coordinator: MutationCoordinator<PersistedIngestionResult, TTransaction>;
      limits?: Partial<CsvLimits>;
      reader: CsvObjectReader;
      repository: (transaction: TTransaction, sourceNamespace: string) => IngestionRepository;
    },
  ) {}

  async ingest(input: {
    contentHash: string;
    sellerId: string;
    storageObjectKey: string;
  }): Promise<PersistedIngestionResult> {
    const prepared = await readCanonicalCsv({
      expectedContentHash: input.contentHash,
      ...(this.dependencies.limits === undefined ? {} : { limits: this.dependencies.limits }),
      reader: this.dependencies.reader,
      storageObjectKey: input.storageObjectKey,
    });
    const scope: MutationScope = {
      actorId: this.dependencies.context.actorId,
      idempotencyKey: this.dependencies.context.idempotencyKey,
      operationId: "createCsvIngestion",
      requestId: this.dependencies.context.requestId,
      tenantId: this.dependencies.context.tenantId,
    };
    const sourceNamespace = csvSourceNamespace(input.sellerId);
    return this.dependencies.coordinator.execute({
      audit: {
        action: "marketplace.ingestion.completed",
        resourceType: "SELLER",
        resourceId: input.sellerId,
      },
      event: {
        aggregateId: input.sellerId,
        aggregateType: "SELLER",
        aggregateVersion: 1,
        eventType: "marketplace.sync.completed",
        payload: {
          contentHash: prepared.contentHash,
          sellerId: input.sellerId,
          sourceNamespace,
        },
      },
      mutate: (transaction) =>
        this.dependencies.repository(transaction, sourceNamespace).persist({
          byteCount: prepared.byteCount,
          contentHash: prepared.contentHash,
          events: prepared.events,
          report: prepared.report,
          sellerId: input.sellerId,
          storageObjectKey: input.storageObjectKey,
          tenantId: this.dependencies.context.tenantId,
        }),
      // The secret object reference is deliberately excluded from the durable
      // idempotency payload, audit record, and outbox event.
      payload: { contentHash: prepared.contentHash, sellerId: input.sellerId },
      responseStatus: 202,
      scope,
    });
  }
}
