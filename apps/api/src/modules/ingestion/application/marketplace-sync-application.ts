import {
  MutationCoordinator,
  type MutationScope,
  type MutationTransaction,
} from "../../../reliability/mutation-coordinator.js";
import { DomainError } from "../../shared/errors.js";
import type { MarketplaceAdapter, MarketplaceBatch } from "../ports/marketplace-adapter.js";
import type {
  IngestionRepository,
  PersistedIngestionResult,
} from "./ingest-csv.js";
import type { IngestionCommandContext } from "./csv-ingestion-application.js";

export class MarketplaceSyncApplication<
  TTransaction extends MutationTransaction<PersistedIngestionResult>,
> {
  constructor(
    private readonly dependencies: {
      adapter: MarketplaceAdapter;
      context: IngestionCommandContext;
      coordinator: MutationCoordinator<PersistedIngestionResult, TTransaction>;
      repository: (
        transaction: TTransaction,
        input: { marketplaceConnectionId: string; sourceNamespace: string },
      ) => IngestionRepository;
    },
  ) {}

  async sync(input: {
    force?: boolean;
    marketplaceConnectionId: string;
  }): Promise<PersistedIngestionResult> {
    if (this.dependencies.adapter.mode !== "SANDBOX") {
      throw new DomainError("VALIDATION_FAILED", "No production marketplace adapter is configured.");
    }
    const batch = await this.dependencies.adapter.fetch({
      marketplaceConnectionId: input.marketplaceConnectionId,
    });
    return this.persistBatch(input, batch);
  }

  private persistBatch(
    input: { force?: boolean; marketplaceConnectionId: string },
    batch: MarketplaceBatch,
  ): Promise<PersistedIngestionResult> {
    const scope: MutationScope = {
      actorId: this.dependencies.context.actorId,
      idempotencyKey: this.dependencies.context.idempotencyKey,
      operationId: "syncMarketplaceConnection",
      requestId: this.dependencies.context.requestId,
      tenantId: this.dependencies.context.tenantId,
    };
    return this.dependencies.coordinator.execute({
      audit: {
        action: "marketplace.sync.completed",
        resourceId: input.marketplaceConnectionId,
        resourceType: "MARKETPLACE_CONNECTION",
      },
      event: {
        aggregateId: input.marketplaceConnectionId,
        aggregateType: "MARKETPLACE_CONNECTION",
        aggregateVersion: 1,
        eventType: "marketplace.sync.completed",
        payload: {
          batchHash: batch.batchHash,
          marketplaceConnectionId: input.marketplaceConnectionId,
          sourceNamespace: batch.sourceNamespace,
        },
      },
      mutate: async (transaction) => {
        const repository = this.dependencies.repository(transaction, {
          marketplaceConnectionId: input.marketplaceConnectionId,
          sourceNamespace: batch.sourceNamespace,
        });
        const connection = await repository.findConnection(
          this.dependencies.context.tenantId,
          input.marketplaceConnectionId,
        );
        if (connection === null) {
          throw new DomainError("VALIDATION_FAILED", "Marketplace connection is unavailable.");
        }
        return repository.persist({
          contentHash: batch.batchHash,
          events: batch.events,
          report: batch.report,
          sellerId: connection.sellerId,
          tenantId: this.dependencies.context.tenantId,
        });
      },
      payload: {
        batchHash: batch.batchHash,
        force: input.force ?? false,
        marketplaceConnectionId: input.marketplaceConnectionId,
      },
      responseStatus: 202,
      scope,
    });
  }
}
