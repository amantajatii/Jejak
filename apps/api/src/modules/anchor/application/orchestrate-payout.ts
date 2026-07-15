import { canonicalHash } from "../../../reliability/canonical-json.js";
import { IdempotencyConflictError } from "../../../reliability/mutation-coordinator.js";
import { AnchorError, asAnchorError } from "../domain/errors.js";
import { anchorRequestHash, validateAnchorReceipt } from "../domain/receipt.js";
import type {
  AnchorPayoutContext,
  AnchorPayoutReceipt,
  AnchorPayoutRequest,
  AnchorSandboxConfig,
} from "../domain/types.js";
import type { AnchorPayoutPort } from "../ports/anchor-payout.js";
import type { AnchorPayoutJournal } from "../ports/payout-journal.js";

export class AnchorPayoutOrchestrator {
  constructor(
    private readonly anchor: AnchorPayoutPort,
    private readonly journal: AnchorPayoutJournal,
    private readonly sandboxConfig: AnchorSandboxConfig,
  ) {}

  async execute(
    context: AnchorPayoutContext,
    options: { maxAttempts?: number; sleep?: (attempt: number) => Promise<void> } = {},
  ): Promise<AnchorPayoutReceipt> {
    if (this.anchor.mode !== "SANDBOX") {
      throw new AnchorError("REJECTED", "No production anchor implementation is configured.");
    }
    const request: AnchorPayoutRequest = {
      aggregateId: context.aggregateId,
      partnerIdempotencyKey: canonicalHash({
        aggregateId: context.aggregateId,
        idempotencyKey: context.idempotencyKey,
        operationId: context.operationId,
        tenantId: context.tenantId,
      }),
      requestedAt: context.requestedAt,
      source: context.source,
      tenantId: context.tenantId,
    };
    const requestHash = anchorRequestHash(request);
    const decision = await this.journal.begin({
      context,
      partnerIdempotencyKey: request.partnerIdempotencyKey,
      requestHash,
    });
    if (decision.kind === "CONFLICT") throw new IdempotencyConflictError();
    if (decision.kind === "REPLAY") return decision.receipt;
    if (decision.kind === "FAILED") {
      throw new AnchorError(decision.classification, "Anchor payout previously failed terminally.");
    }

    const maxAttempts = options.maxAttempts ?? 2;
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 5) {
      throw new AnchorError("REJECTED", "Anchor max attempts must be an integer from 1 through 5.");
    }
    const sleep = options.sleep ?? (async () => undefined);
    let lastError: AnchorError | undefined;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const receipt = await this.anchor.requestPayout(request);
        validateAnchorReceipt(request, receipt, this.sandboxConfig);
        await this.journal.recordAttempt({
          attempt,
          context,
          operationId: decision.operationId,
          requestHash,
          status: "SUCCESS",
        });
        return this.journal.commitReceipt({
          context,
          operationId: decision.operationId,
          partnerIdempotencyKey: request.partnerIdempotencyKey,
          receipt,
          resolution: "DIRECT",
        });
      } catch (rawError) {
        const error = asAnchorError(rawError);
        lastError = error;
        await this.journal.recordAttempt({
          attempt,
          classification: error.classification,
          context,
          operationId: decision.operationId,
          requestHash,
          status: error.retryable ? "RETRYABLE_FAILURE" : "TERMINAL_FAILURE",
        });
        if (!error.retryable) {
          await this.journal.recordFailure({
            classification: error.classification,
            context,
            operationId: decision.operationId,
            retryable: false,
          });
          throw error;
        }
        if (attempt < maxAttempts) await sleep(attempt);
      }
    }

    const reconciled = await this.anchor.findPayout(request.partnerIdempotencyKey);
    if (reconciled !== null) {
      validateAnchorReceipt(request, reconciled, this.sandboxConfig);
      return this.journal.commitReceipt({
        context,
        operationId: decision.operationId,
        partnerIdempotencyKey: request.partnerIdempotencyKey,
        receipt: reconciled,
        resolution: "RECONCILED",
      });
    }
    const failure = lastError ?? new AnchorError("TRANSPORT", "Anchor payout did not return a result.");
    await this.journal.recordFailure({
      classification: failure.classification,
      context,
      operationId: decision.operationId,
      retryable: true,
    });
    throw failure;
  }
}
