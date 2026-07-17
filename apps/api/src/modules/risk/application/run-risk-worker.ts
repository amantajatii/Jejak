import { v7 as uuidv7 } from "uuid";

import type { JejakDatabase } from "../../../db/client.js";
import type { TransactionActorContext } from "../../../db/context.js";
import type { RiskEvaluationClient } from "../ports/client.js";
import type {
  RiskPostEvaluationLifecycle,
  SellerSubjectHasher,
} from "../ports/durable-operation.js";
import { createPostgresRiskEvaluationWorker } from "./postgres-composition.js";
import {
  PostgresRiskWorkQueue,
  RiskWorkerRuntime,
  type RiskWorkerRunSummary,
} from "./worker-runtime.js";

export type RiskWorkerRuntimeOptions = {
  actorId: string;
  batchSize?: number;
  client: RiskEvaluationClient;
  database: JejakDatabase;
  maxAttempts?: number;
  policyVersion: string;
  pollMs?: number;
  postEvaluation?: RiskPostEvaluationLifecycle;
  postEvaluationFor?: (
    actorContext: TransactionActorContext,
  ) => RiskPostEvaluationLifecycle;
  requestId?: string;
  sellerSubjectHasher: SellerSubjectHasher;
  tenantId: string;
};

/** Assemble the durable tenant-scoped worker used by both API and CLI runtimes. */
export function createRiskWorkerRuntime(input: RiskWorkerRuntimeOptions): RiskWorkerRuntime {
  const actorBase = {
    actorId: input.actorId,
    requestId: input.requestId ?? uuidv7(),
    tenantId: input.tenantId,
  };
  return new RiskWorkerRuntime(
    {
      queue: new PostgresRiskWorkQueue(input.database, actorBase),
      workerFor: (requestId) => {
        const actorContext = { ...actorBase, requestId };
        const postEvaluation =
          input.postEvaluationFor?.(actorContext) ?? input.postEvaluation;
        return createPostgresRiskEvaluationWorker({
          actorContext,
          client: input.client,
          database: input.database,
          maxAttempts: input.maxAttempts ?? 3,
          policyVersion: input.policyVersion,
          ...(postEvaluation === undefined ? {} : { postEvaluation }),
          sellerSubjectHasher: input.sellerSubjectHasher,
          sleep: async (attempt) =>
            new Promise((resolveSleep) => setTimeout(resolveSleep, attempt * 250)),
        });
      },
    },
    {
      batchSize: input.batchSize ?? 10,
      pollMs: input.pollMs ?? 1_000,
    },
  );
}

/**
 * Poll until aborted. Queue/connection failures are isolated to one cycle so a
 * hosted web process cannot be terminated by its embedded worker.
 */
export async function runRiskWorkerLoop(
  runtime: Pick<RiskWorkerRuntime, "runOnce">,
  options: {
    log?: (summary: RiskWorkerRunSummary) => void;
    logCycleFailure?: () => void;
    pollMs: number;
    tenantId: string;
  },
  signal: AbortSignal,
): Promise<void> {
  const sleep = (milliseconds: number) =>
    new Promise<void>((resolveSleep) => {
      const timer = setTimeout(resolveSleep, milliseconds);
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          resolveSleep();
        },
        { once: true },
      );
    });

  while (!signal.aborted) {
    try {
      const summary = await runtime.runOnce(options.tenantId);
      if (summary.attempted > 0) options.log?.(summary);
    } catch {
      options.logCycleFailure?.();
    }
    if (!signal.aborted) await sleep(options.pollMs);
  }
}
