import createClient from "openapi-fetch";

import type { paths } from "./generated/schema.js";

export interface JejakClientOptions {
  baseUrl: string;
  getAccessToken: () => Promise<string | null>;
  getTenantId?: () => Promise<string | null>;
  fetch?: typeof globalThis.fetch;
}

export interface CommandHeaderOptions {
  idempotencyKey: string;
  correlationId?: string;
  expectedVersion?: number;
}

export function commandHeaders(options: CommandHeaderOptions) {
  return {
    "Idempotency-Key": options.idempotencyKey,
    ...(options.correlationId === undefined
      ? {}
      : { "X-Correlation-Id": options.correlationId }),
    ...(options.expectedVersion === undefined
      ? {}
      : { "If-Match": options.expectedVersion }),
  };
}

export function createJejakClient(options: JejakClientOptions) {
  const client = createClient<paths>({
    baseUrl: options.baseUrl,
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
  });

  client.use({
    async onRequest({ request }) {
      const token = await options.getAccessToken();
      if (token !== null && token.length > 0) {
        request.headers.set("Authorization", `Bearer ${token}`);
      }
      const tenantId = await options.getTenantId?.();
      if (tenantId !== undefined && tenantId !== null && tenantId.length > 0) {
        request.headers.set("X-Jejak-Tenant-Id", tenantId);
      }
      return request;
    },
  });

  return client;
}

export type JejakClient = ReturnType<typeof createJejakClient>;
