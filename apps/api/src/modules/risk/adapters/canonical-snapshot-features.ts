import type { DecisionSnapshot } from "../../reconciliation/domain/snapshot.js";
import type { RiskFeatureProjector } from "../ports/durable-operation.js";

export class CanonicalSnapshotRiskFeatureProjector implements RiskFeatureProjector {
  async project(snapshot: DecisionSnapshot) {
    return {
      blocksAutomation: snapshot.blocksAutomation,
      dataQualityScoreBps: snapshot.dataQualityScoreBps,
      eventCount: snapshot.includedEventHashes.length,
      featureSchemaVersion: snapshot.featureSchemaVersion,
      grossUnsettledAmountMinor: snapshot.grossUnsettled.amountMinor,
      knownAdjustmentsAmountMinor: snapshot.knownAdjustments.amountMinor,
      orderCount: snapshot.orderCount,
      realizedToDateAmountMinor: snapshot.realizedToDate.amountMinor,
      snapshotSchemaVersion: snapshot.snapshotSchemaVersion,
      sourceCurrency: snapshot.sourceCurrency,
    };
  }
}
