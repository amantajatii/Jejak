import { and, eq, notInArray } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";

import type { JejakDatabase } from "../../../db/client.js";
import type { TransactionActorContext } from "../../../db/context.js";
import { claims as claimRows } from "../../../db/schema/domain.js";
import { decisionSnapshotMetadata } from "../../../db/schema/lifecycle.js";
import { operations } from "../../../db/schema/reliability.js";
import {
  MutationCoordinator,
  type MutationScope,
} from "../../../reliability/mutation-coordinator.js";
import {
  PostgresMutationUnitOfWork,
  type PostgresMutationTransaction,
} from "../../../reliability/postgres-mutation-unit.js";
import { PostgresDecisionSnapshotRepository } from "../../reconciliation/adapters/postgres-repository.js";
import { DomainError } from "../../shared/errors.js";
import { sha256Hex } from "../../shared/hash.js";
import type { MoneyValue } from "../../shared/money.js";
import { PostgresClaimRepository } from "../adapters/postgres-repository.js";
import {
  createClaim,
  startClaimAnalysis,
  type LifecycleClaim,
} from "../domain/lifecycle.js";

export type ClaimCommandContext = TransactionActorContext & {
  idempotencyKey: string;
};

const terminalStates = ["CLOSED", "CLOSED_WITH_LOSS", "REJECTED", "CANCELLED"] as const;

function mutationScope(context: ClaimCommandContext, operationId: string): MutationScope {
  return {
    actorId: context.actorId,
    tenantId: context.tenantId,
    requestId: context.requestId,
    idempotencyKey: context.idempotencyKey,
    operationId,
  };
}

export class ClaimLifecycleApplication {
  constructor(
    private readonly database: JejakDatabase,
    private readonly context: ClaimCommandContext,
    private readonly options: { nextId?: () => string; now?: () => Date } = {},
  ) {}

  async create(input: {
    sellerId: string;
    settlementStreamId: string;
    facilityId: string;
    requestedAdvance: MoneyValue;
  }): Promise<LifecycleClaim> {
    const nextId = this.options.nextId ?? uuidv7;
    const now = this.options.now ?? (() => new Date());
    const claimId = nextId();
    const unit = new PostgresMutationUnitOfWork<LifecycleClaim>(this.database, this.context, {
      nextId,
      now,
    });
    const coordinator = new MutationCoordinator<
      LifecycleClaim,
      PostgresMutationTransaction<LifecycleClaim>
    >(unit);
    return coordinator.execute({
      scope: mutationScope(this.context, "createClaim"),
      payload: input,
      responseStatus: 201,
      audit: {
        action: "claim.created",
        resourceType: "CLAIM",
        resourceId: claimId,
        afterVersion: 1,
      },
      event: {
        aggregateId: claimId,
        aggregateType: "CLAIM",
        aggregateVersion: 1,
        eventType: "claim.created",
        payload: {
          claimId,
          sellerId: input.sellerId,
          settlementStreamId: input.settlementStreamId,
        },
      },
      mutate: async (transaction) => {
        const snapshotRepository = new PostgresDecisionSnapshotRepository(transaction.database);
        const snapshot = await snapshotRepository.findById(
          this.context.tenantId,
          input.settlementStreamId,
        );
        if (snapshot === null || snapshot.sellerId !== input.sellerId) {
          throw new DomainError("VALIDATION_FAILED", "Settlement snapshot is unavailable.");
        }
        const [activeClaim] = await transaction.database
          .select({ id: claimRows.id })
          .from(claimRows)
          .where(
            and(
              eq(claimRows.tenantId, this.context.tenantId),
              eq(claimRows.settlementStreamId, input.settlementStreamId),
              notInArray(claimRows.state, [...terminalStates]),
            ),
          )
          .limit(1);
        const [metadata] = await transaction.database
          .select({ blocksAutomation: decisionSnapshotMetadata.blocksAutomation })
          .from(decisionSnapshotMetadata)
          .where(
            and(
              eq(decisionSnapshotMetadata.tenantId, this.context.tenantId),
              eq(decisionSnapshotMetadata.settlementStreamId, input.settlementStreamId),
            ),
          )
          .limit(1);
        const claim = createClaim({
          id: claimId,
          claimKey: sha256Hex(`JEJAK:CLAIM:v1:${claimId}`),
          tenantId: this.context.tenantId,
          sellerId: input.sellerId,
          settlementStreamId: input.settlementStreamId,
          facilityId: input.facilityId,
          grossUnsettled: snapshot.grossUnsettled,
          requestedAdvance: input.requestedAdvance,
          blocksAutomation: metadata?.blocksAutomation ?? true,
          snapshotEncumbered: activeClaim !== undefined,
          now: now().toISOString(),
        }).claim;
        await new PostgresClaimRepository(transaction.database).insert(claim);
        return claim;
      },
    });
  }

  async analyze(input: {
    claimId: string;
    expectedVersion: number;
    snapshotCutoffAt: string;
  }): Promise<{ jobId: string; status: "QUEUED" }> {
    const nextId = this.options.nextId ?? uuidv7;
    const now = this.options.now ?? (() => new Date());
    const jobId = nextId();
    type Response = { jobId: string; status: "QUEUED" };
    const unit = new PostgresMutationUnitOfWork<Response>(this.database, this.context, {
      nextId,
      now,
    });
    const coordinator = new MutationCoordinator<Response, PostgresMutationTransaction<Response>>(
      unit,
    );
    return coordinator.execute({
      scope: mutationScope(this.context, "analyzeClaim"),
      payload: input,
      responseStatus: 202,
      audit: {
        action: "claim.analysis.started",
        resourceType: "CLAIM",
        resourceId: input.claimId,
        beforeVersion: input.expectedVersion,
        afterVersion: input.expectedVersion + 1,
      },
      event: {
        aggregateId: input.claimId,
        aggregateType: "CLAIM",
        aggregateVersion: input.expectedVersion + 1,
        eventType: "claim.state.changed",
        payload: { claimId: input.claimId, state: "ANALYZED", operationId: jobId },
      },
      mutate: async (transaction) => {
        const repository = new PostgresClaimRepository(transaction.database);
        const claim = await repository.findById(this.context.tenantId, input.claimId);
        if (claim === null) throw new DomainError("VALIDATION_FAILED", "Claim is unavailable.");
        const transition = startClaimAnalysis(claim, {
          expectedVersion: input.expectedVersion,
          now: now().toISOString(),
        });
        await repository.update(transition.claim, input.expectedVersion);
        await transaction.database.insert(operations).values({
          id: jobId,
          tenantId: this.context.tenantId,
          kind: "RISK_EVALUATION",
          status: "QUEUED",
          resourceType: "CLAIM",
          resourceId: input.claimId,
          context: {
            claimId: input.claimId,
            settlementStreamId: claim.settlementStreamId,
            snapshotCutoffAt: input.snapshotCutoffAt,
          },
          createdAt: now(),
          updatedAt: now(),
        });
        return { jobId, status: "QUEUED" };
      },
    });
  }
}
