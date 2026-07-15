import { metrics, SpanStatusCode, trace, type Attributes } from "@opentelemetry/api";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";
import type { FastifyInstance, FastifyRequest } from "fastify";

import type { AppConfig } from "../config/env.js";

const allowedAttributeKeys = new Set([
  "http.request.method",
  "http.response.status_code",
  "jejak.operation_id",
  "jejak.outcome",
  "jejak.role",
  "jejak.tenant_id",
  "server.address",
  "url.path",
]);

export function telemetryAttributes(input: Record<string, unknown>): Attributes {
  return Object.fromEntries(
    Object.entries(input).filter(
      ([key, value]) =>
        allowedAttributeKeys.has(key) &&
        (typeof value === "string" || typeof value === "number" || typeof value === "boolean"),
    ),
  ) as Attributes;
}

export type TelemetryRuntime = { shutdown(): Promise<void> };

export async function startTelemetry(config: AppConfig): Promise<TelemetryRuntime> {
  if (!config.otelEnabled || config.otelEndpoint === undefined) {
    return { shutdown: async () => undefined };
  }
  const base = config.otelEndpoint.replace(/\/$/, "");
  const sdk = new NodeSDK({
    instrumentations: [
      new HttpInstrumentation({
        requestHook: (span, request) => {
          span.setAttributes(
            telemetryAttributes({
              "http.request.method": "method" in request ? request.method : undefined,
            }),
          );
        },
      }),
    ],
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({ url: `${base}/v1/metrics` }),
      exportIntervalMillis: 15_000,
    }),
    serviceName: config.otelServiceName,
    traceExporter: new OTLPTraceExporter({ url: `${base}/v1/traces` }),
  });
  sdk.start();
  return { shutdown: () => sdk.shutdown() };
}

export function registerTelemetryHooks(app: FastifyInstance): void {
  const tracer = trace.getTracer("@jejak/api");
  const meter = metrics.getMeter("@jejak/api");
  const counter = meter.createCounter("jejak.http.requests", { unit: "{request}" });
  const duration = meter.createHistogram("jejak.http.duration", { unit: "ms" });
  const state = new WeakMap<FastifyRequest, { startedAt: number; span: ReturnType<typeof tracer.startSpan> }>();

  app.addHook("onRequest", async (request) => {
    const path = request.url.split("?", 1)[0] ?? "/";
    const span = tracer.startSpan("jejak.http.request", {
      attributes: telemetryAttributes({ "http.request.method": request.method, "url.path": path }),
    });
    state.set(request, { span, startedAt: performance.now() });
  });
  app.addHook("onResponse", async (request, reply) => {
    const current = state.get(request);
    if (current === undefined) return;
    const attributes = telemetryAttributes({
      "http.request.method": request.method,
      "http.response.status_code": reply.statusCode,
      "jejak.outcome": reply.statusCode < 500 ? "handled" : "failed",
    });
    counter.add(1, attributes);
    duration.record(performance.now() - current.startedAt, attributes);
    current.span.setAttributes(attributes);
    current.span.setStatus({ code: reply.statusCode >= 500 ? SpanStatusCode.ERROR : SpanStatusCode.OK });
    current.span.end();
    state.delete(request);
  });
  app.addHook("onError", async (request) => {
    state.get(request)?.span.setStatus({ code: SpanStatusCode.ERROR });
  });
}
