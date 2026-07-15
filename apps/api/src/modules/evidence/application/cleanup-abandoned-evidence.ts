import type { CleanupResult } from "../domain/types.js";
import type {
  EvidenceReferenceRegistry,
  EvidenceStorage,
  EvidenceTelemetry,
} from "../ports/evidence-storage.js";
import { noopEvidenceTelemetry } from "../ports/evidence-storage.js";

export class CleanupAbandonedEvidence {
  constructor(
    private readonly storage: EvidenceStorage,
    private readonly registry: EvidenceReferenceRegistry,
    private readonly cleanupBatchSize: number,
    private readonly telemetry: EvidenceTelemetry = noopEvidenceTelemetry,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  execute(input: { olderThanSeconds: number; tenantPrefix: string }): Promise<CleanupResult> {
    const attributes = { mode: this.storage.mode, operation: "cleanup" };
    return this.telemetry.trace("evidence.cleanup", attributes, async () => {
      const cutoff = this.clock().getTime() - input.olderThanSeconds * 1000;
      const page = await this.storage.listObjects({ limit: this.cleanupBatchSize, prefix: input.tenantPrefix });
      const result: CleanupResult = { deleted: 0, inspected: page.objects.length, retained: 0 };
      for (const object of page.objects) {
        if (object.createdAt.getTime() > cutoff || (await this.registry.isFinalized(object.objectKey))) {
          result.retained += 1;
          continue;
        }
        await this.storage.removeObject(object.objectKey);
        result.deleted += 1;
      }
      this.telemetry.count("jejak.evidence.cleanup.total", { ...attributes, outcome: "success" });
      return result;
    });
  }
}
