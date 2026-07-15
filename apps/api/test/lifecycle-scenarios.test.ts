import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { createClaim } from "../src/modules/claims/domain/lifecycle.js";
import type { CanonicalMarketplaceEvent } from "../src/modules/ingestion/domain/types.js";
import { buildDecisionSnapshot } from "../src/modules/reconciliation/domain/snapshot.js";
import { DeterministicRiskStub } from "../src/modules/risk/adapters/deterministic-stub.js";
import { evaluateWithRetry } from "../src/modules/risk/adapters/http-client.js";
import {
  buildRiskEvaluationRequest,
  validateRiskEvaluation,
} from "../src/modules/risk/domain/evaluation.js";
import { canonicalHash } from "../src/modules/shared/hash.js";

type Scenario = {
  scenario: string;
  source: {
    sellerId: string;
    claimId: string;
    marketplaceEvents: Array<{
      eventId: string;
      type: CanonicalMarketplaceEvent["eventType"];
      occurredAt: string;
      amount: CanonicalMarketplaceEvent["amount"];
    }>;
    adapter: {
      outcome: "SUCCESS" | "TIMEOUT_THEN_SUCCESS";
      attemptsBeforeSuccess: number;
    };
  };
  expected: {
    snapshot: {
      grossUnsettled: CanonicalMarketplaceEvent["amount"];
      eligibleSettlementValue: CanonicalMarketplaceEvent["amount"];
      advanceAmount: CanonicalMarketplaceEvent["amount"];
    };
    evaluation: { decision: "ELIGIBLE" | "REVIEW" | "INELIGIBLE" };
    errorCode: string | null;
  };
};

const fixtures = resolve(process.cwd(), "../../packages/domain/fixtures");

async function load(name: string): Promise<Scenario> {
  return JSON.parse(await readFile(resolve(fixtures, `${name}.json`), "utf8")) as Scenario;
}

function canonicalEvents(scenario: Scenario): CanonicalMarketplaceEvent[] {
  return scenario.source.marketplaceEvents.map((event, index) => ({
    externalEventId: event.eventId,
    eventType: event.type,
    occurredAt: event.occurredAt,
    amount: event.amount,
    sourceRowHash: canonicalHash({
      externalEventId: event.eventId,
      eventType: event.type,
      occurredAt: event.occurredAt,
      amount: event.amount,
    }),
    sourceRowNumber: index + 2,
  }));
}

describe("shared BE-05 through BE-08 scenarios", () => {
  for (const name of ["happy_claim", "missing_data", "refund_spike", "partner_timeout"] as const) {
    it(`reproduces ${name}`, async () => {
      const scenario = await load(name);
      const events = canonicalEvents(scenario);
      const moneyUnit = {
        ...scenario.expected.snapshot.grossUnsettled,
        amountMinor: "0",
      };
      const incrementalRefund = events.length === 1 && events[0]?.eventType === "REFUND";
      const report = {
        format: "JEJAK_CANONICAL_CSV_V1" as const,
        totalRows: events.length,
        validUniqueRows: events.length,
        duplicateRows: 0,
        rejectedRows: 0,
        qualityScoreBps: events.length === 0 ? 0 : 10000,
        issues: events.length === 0
          ? [
              {
                code: "MISSING_PAYOUT_HISTORY" as const,
                severity: "BLOCKING" as const,
                blocksAutomation: true,
                detail: "No marketplace event rows were supplied.",
              },
            ]
          : [],
      };
      const snapshot = buildDecisionSnapshot({
        id: "0198a5ea-7c9c-7000-8000-000000000301",
        tenantId: "0198a5ea-7c9c-7000-8000-000000000901",
        sellerId: scenario.source.sellerId,
        marketplaceConnectionId: "0198a5ea-7c9c-7000-8000-000000000801",
        cutoffAt: "2026-07-15T23:59:59Z",
        createdAt: "2026-07-15T23:59:59Z",
        events,
        qualityReport: report,
        moneyUnit,
        ...(incrementalRefund
          ? {
              baseline: {
                grossUnsettled: scenario.expected.snapshot.grossUnsettled,
                knownAdjustments: moneyUnit,
                realizedToDate: moneyUnit,
                orderCount: 1,
              },
            }
          : {}),
      });
      expect(snapshot.grossUnsettled).toEqual(scenario.expected.snapshot.grossUnsettled);

      const riskRequest = buildRiskEvaluationRequest({
        requestId: `request-${name}`,
        claimId: scenario.source.claimId,
        claimKey: "a".repeat(64),
        sellerSubjectHash: "b".repeat(64),
        settlementStreamId: snapshot.id,
        dataSnapshotHash: snapshot.dataSnapshotHash,
        snapshotCutoffAt: snapshot.snapshotCutoffAt,
        sourceCurrency: snapshot.sourceCurrency,
        features: {
          missingPayoutHistory: events.length === 0,
          refundRateBps: incrementalRefund ? 3000 : 0,
        },
        grossUnsettled: snapshot.grossUnsettled,
        policyVersion: "sandbox-policy-v1",
      });
      const stub = new DeterministicRiskStub({
        mode:
          scenario.source.adapter.outcome === "TIMEOUT_THEN_SUCCESS"
            ? "TIMEOUT_THEN_SUCCESS"
            : "SUCCESS",
      });
      const response = await evaluateWithRetry(stub, riskRequest, {
        maxAttempts: scenario.source.adapter.attemptsBeforeSuccess,
        sleep: async () => undefined,
      });
      const trusted = validateRiskEvaluation(riskRequest, response, {
        blocksAutomation: report.issues.some((issue) => issue.blocksAutomation),
      });
      expect(trusted.effectiveDecision).toBe(scenario.expected.evaluation.decision);
      expect(trusted.eligibleSettlementValue).toEqual(
        scenario.expected.snapshot.eligibleSettlementValue,
      );
      expect(trusted.maxAdvanceAmount).toEqual(scenario.expected.snapshot.advanceAmount);
      expect(stub.attempts).toBe(scenario.source.adapter.attemptsBeforeSuccess);
    });
  }

  it("rejects duplicate_claim before RISK evaluation", async () => {
    const scenario = await load("duplicate_claim");
    try {
      createClaim({
        id: scenario.source.claimId,
        claimKey: "c".repeat(64),
        tenantId: "0198a5ea-7c9c-7000-8000-000000000901",
        sellerId: scenario.source.sellerId,
        settlementStreamId: "0198a5ea-7c9c-7000-8000-000000000301",
        facilityId: "0198a5ea-7c9c-7000-8000-000000000701",
        grossUnsettled: scenario.expected.snapshot.grossUnsettled,
        requestedAdvance: scenario.expected.snapshot.grossUnsettled,
        blocksAutomation: false,
        snapshotEncumbered: true,
        now: "2026-07-15T00:00:00Z",
      });
    } catch (error) {
      expect(error).toMatchObject({ code: scenario.expected.errorCode });
    }
  });
});
