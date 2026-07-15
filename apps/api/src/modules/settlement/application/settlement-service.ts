import { canonicalHash } from "../../../reliability/canonical-json.js";
import { assertSameMoneyUnit } from "../../shared/money.js";
import {
  calculateWaterfall,
  SettlementProtocolError,
  type SettlementEventInput,
  type SettlementEventRecord,
} from "../domain/settlement.js";
import type {
  CanonicalWaterfallLookupPort,
  ExecuteWaterfallInput,
  SettlementContext,
  SettlementJournalPort,
  WaterfallRun,
  WaterfallSubmissionPort,
  WaterfallSubmissionReceipt,
} from "../ports/settlement.js";
import { WaterfallSubmissionError } from "../ports/settlement.js";

export class SettlementService {
  constructor(private readonly dependencies: {
    canonicalEvents: CanonicalWaterfallLookupPort;
    journal: SettlementJournalPort;
    servicerAddress: string;
    submitter: WaterfallSubmissionPort;
  }) {}

  ingest(context: SettlementContext, input: SettlementEventInput): Promise<SettlementEventRecord> {
    return this.dependencies.journal.ingest(context, input);
  }

  async executeWaterfall(context: SettlementContext, input: ExecuteWaterfallInput): Promise<WaterfallRun> {
    const loaded = await this.dependencies.journal.loadWaterfallPosition({
      claimId: input.claimId,
      context,
      settlementEventId: input.settlementEventId,
    });
    if (loaded.event.eventType !== "SETTLEMENT") {
      throw new SettlementProtocolError("INVALID_SETTLEMENT", "Only SETTLEMENT events can execute the waterfall.");
    }
    assertSameMoneyUnit(loaded.position.outstandingPrincipal, loaded.event.amount);
    const allocation = calculateWaterfall({
      finalSettlement: input.finalSettlement,
      financingFeeDue: input.financingFeeDue,
      position: loaded.position,
      servicingFeeDue: input.servicingFeeDue,
      settlement: loaded.event.amount,
      settlementEventId: loaded.event.id,
    });
    let run = await this.dependencies.journal.prepareWaterfall({
      allocation,
      context,
      expectedVersion: input.expectedVersion,
      position: loaded.position,
    });
    if (run.status === "PENDING_RECONCILIATION" || run.status === "RECONCILED" || run.status === "FAILED_PROTOCOL") return run;

    const recovered = await this.dependencies.canonicalEvents.findByResultHash({
      resultHash: allocation.resultHash,
      tenantId: context.tenantId,
    });
    if (recovered !== undefined) {
      return this.dependencies.journal.markSubmitted({
        context,
        recoveredEvent: recovered,
        receipt: {
          envelopeHash: canonicalHash({ recoveredEventId: recovered.eventId }),
          transactionHash: recovered.transactionHash,
        },
        run,
      });
    }
    if (run.status === "SUBMITTING" || run.status === "SUBMITTING_AMBIGUOUS") {
      return { ...run, replayed: true, status: "SUBMITTING_AMBIGUOUS" };
    }

    await this.dependencies.journal.markSubmitting({ context, runId: run.id });
    run = { ...run, status: "SUBMITTING" };
    let receipt: WaterfallSubmissionReceipt;
    try {
      receipt = await this.dependencies.submitter.submit({
        allocation,
        claimKey: loaded.position.claimKey,
        servicerAddress: this.dependencies.servicerAddress,
      });
    } catch (error) {
      if (error instanceof WaterfallSubmissionError) {
        if (error.submissionMayHaveSucceeded) {
          await this.dependencies.journal.markAmbiguous({ context, runId: run.id });
          return { ...run, status: "SUBMITTING_AMBIGUOUS" };
        }
        if (!error.retryable) {
          await this.dependencies.journal.markFailed({ context, runId: run.id });
          throw error;
        }
      }
      await this.dependencies.journal.markPrepared({ context, runId: run.id });
      throw error;
    }
    return this.dependencies.journal.markSubmitted({ context, receipt, run });
  }
}
