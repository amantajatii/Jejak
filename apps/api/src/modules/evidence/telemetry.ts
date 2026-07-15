import { metrics, SpanStatusCode, trace } from "@opentelemetry/api";

import type { EvidenceTelemetry } from "./ports/evidence-storage.js";

const allowedKeys = new Set(["claimId", "evidenceId", "mode", "operation", "outcome", "tenantId", "version"]);

export function safeEvidenceAttributes(
  input: Record<string, string | number | boolean>,
): Record<string, string | number | boolean> {
  return Object.fromEntries(Object.entries(input).filter(([key]) => allowedKeys.has(key)));
}

export function createOpenTelemetryEvidenceObserver(): EvidenceTelemetry {
  const tracer = trace.getTracer("@jejak/api/evidence");
  const meter = metrics.getMeter("@jejak/api/evidence");
  const counters = new Map<string, ReturnType<typeof meter.createCounter>>();
  const histograms = new Map<string, ReturnType<typeof meter.createHistogram>>();
  return {
    count(name, attributes) {
      let counter = counters.get(name);
      if (counter === undefined) {
        counter = meter.createCounter(name);
        counters.set(name, counter);
      }
      counter.add(1, safeEvidenceAttributes(attributes));
    },
    observe(name, value, attributes) {
      let histogram = histograms.get(name);
      if (histogram === undefined) {
        histogram = meter.createHistogram(name);
        histograms.set(name, histogram);
      }
      histogram.record(value, safeEvidenceAttributes(attributes));
    },
    trace(name, attributes, work) {
      return tracer.startActiveSpan(name, { attributes: safeEvidenceAttributes(attributes) }, async (span) => {
        try {
          const result = await work();
          span.setStatus({ code: SpanStatusCode.OK });
          return result;
        } catch (error) {
          span.setStatus({ code: SpanStatusCode.ERROR });
          throw error;
        } finally {
          span.end();
        }
      });
    },
  };
}
