import { trace } from "@opentelemetry/api";
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { describe, expect, it } from "vitest";

import { telemetryAttributes } from "../src/telemetry/index.js";

describe("OpenTelemetry safety", () => {
  it("exports only allowlisted low-cardinality attributes", async () => {
    const exporter = new InMemorySpanExporter();
    const provider = new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] });
    const tracer = provider.getTracer("test");
    const span = tracer.startSpan("auth.verify", {
      attributes: telemetryAttributes({
        "http.request.method": "POST",
        "jejak.outcome": "accepted",
        authorization: "Bearer secret",
        email: "person@example.test",
        token: "raw-token",
      }),
    });
    span.end();
    await provider.forceFlush();
    expect(exporter.getFinishedSpans()[0]?.attributes).toEqual({
      "http.request.method": "POST",
      "jejak.outcome": "accepted",
    });
    expect(JSON.stringify(exporter.getFinishedSpans().map((item) => item.attributes))).not.toContain("secret");
    await provider.shutdown();
    trace.disable();
  });
});
