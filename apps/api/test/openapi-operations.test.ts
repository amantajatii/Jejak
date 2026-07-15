import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

interface Operation {
  operationId: string;
  parameters?: Array<{ $ref?: string }>;
  responses: Record<string, unknown>;
  "x-jejak-roles"?: string[];
}

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const document = JSON.parse(
  readFileSync(path.join(apiRoot, "openapi", "openapi.json"), "utf8"),
) as {
  paths: Record<
    string,
    Record<string, Operation> & { parameters?: Array<{ $ref?: string }> }
  >;
};

const expectedOperations = new Map([
  ["POST /v1/sellers", "createSeller"],
  ["GET /v1/sellers/{sellerId}", "getSeller"],
  ["POST /v1/marketplace-connections", "createMarketplaceConnection"],
  ["POST /v1/marketplace-connections/{id}/sync", "syncMarketplaceConnection"],
  ["POST /v1/ingestions/csv", "createCsvIngestion"],
  ["GET /v1/ingestions/{id}", "getIngestion"],
  ["POST /v1/claims", "createClaim"],
  ["GET /v1/claims/{id}", "getClaim"],
  ["GET /v1/claims", "listClaims"],
  ["POST /v1/claims/{id}/analyze", "analyzeClaim"],
  ["POST /v1/claims/{id}/control-evidence", "submitControlEvidence"],
  ["POST /v1/claims/{id}/control-decision", "decideControlEvidence"],
  ["POST /v1/claims/{id}/offers", "createFinancingOffer"],
  ["POST /v1/offers/{id}/accept", "acceptFinancingOffer"],
  ["POST /v1/claims/{id}/issue", "issueClaim"],
  ["POST /v1/claims/{id}/fund", "fundClaim"],
  ["POST /v1/settlement-events", "createSettlementEvent"],
  ["POST /v1/claims/{id}/reconcile", "reconcileClaim"],
  ["POST /v1/claims/{id}/waterfall", "executeClaimWaterfall"],
  ["POST /v1/claims/{id}/resolution", "resolveClaim"],
  ["POST /v1/claims/{id}/pause", "pauseClaim"],
  ["GET /v1/portfolio/summary", "getPortfolioSummary"],
  ["GET /v1/audit-events", "listAuditEvents"],
  ["POST /v1/institutional-invitations", "createInstitutionalInvitation"],
  ["POST /v1/institutional-invitations/preview", "previewInstitutionalInvitation"],
  ["POST /v1/institutional-invitations/accept", "acceptInstitutionalInvitation"],
  ["POST /v1/institutional-invitations/{id}/revoke", "revokeInstitutionalInvitation"],
]);

function operation(method: string, route: string) {
  return document.paths[route]?.[method.toLowerCase()];
}

describe("frozen Section 18 operation surface", () => {
  it("publishes every public operation exactly once with stable operation IDs and roles", () => {
    const actualIds = new Set<string>();
    for (const [key, expectedId] of expectedOperations) {
      const [method, route] = key.split(" ", 2) as [string, string];
      const item = operation(method, route);
      expect(item?.operationId, key).toBe(expectedId);
      expect(item?.["x-jejak-roles"]?.length, key).toBeGreaterThan(0);
      expect(actualIds.has(expectedId), expectedId).toBe(false);
      actualIds.add(expectedId);
    }
    expect(actualIds.size).toBe(expectedOperations.size);
  });

  it("requires idempotency on every mutation", () => {
    for (const [key] of expectedOperations) {
      const [method, route] = key.split(" ", 2) as [string, string];
      if (method !== "POST") continue;
      const refs = operation(method, route)?.parameters?.map((parameter) => parameter.$ref) ?? [];
      expect(refs.some((ref) => ref?.endsWith("/IdempotencyKey")), key).toBe(true);
    }
  });

  it("requires optimistic concurrency on versioned commands", () => {
    const unversioned = new Set([
      "POST /v1/sellers",
      "POST /v1/marketplace-connections",
      "POST /v1/ingestions/csv",
      "POST /v1/claims",
      "POST /v1/settlement-events",
      "POST /v1/institutional-invitations",
      "POST /v1/institutional-invitations/preview",
      "POST /v1/institutional-invitations/accept",
    ]);
    for (const [key] of expectedOperations) {
      if (!key.startsWith("POST ") || unversioned.has(key)) continue;
      const [method, route] = key.split(" ", 2) as [string, string];
      const refs = operation(method, route)?.parameters?.map((parameter) => parameter.$ref) ?? [];
      expect(refs.some((ref) => ref?.endsWith("/IfMatch")), key).toBe(true);
    }
  });

  it("uses opaque cursor pagination for collection reads", () => {
    for (const route of ["/v1/claims", "/v1/audit-events"]) {
      const refs = operation("GET", route)?.parameters?.map((parameter) => parameter.$ref) ?? [];
      expect(refs.some((ref) => ref?.endsWith("/Cursor")), route).toBe(true);
      expect(refs.some((ref) => ref?.endsWith("/Limit")), route).toBe(true);
    }
  });

  it("requires explicit tenant context on tenant-bound operations", () => {
    const exceptions = new Set([
      "POST /v1/institutional-invitations/preview",
      "POST /v1/institutional-invitations/accept",
    ]);
    for (const [key] of expectedOperations) {
      if (exceptions.has(key)) continue;
      const [, route] = key.split(" ", 2) as [string, string];
      const pathRefs = document.paths[route]?.parameters?.map((parameter) => parameter.$ref) ?? [];
      const [method] = key.split(" ", 1) as [string];
      const operationRefs = operation(method, route)?.parameters?.map((parameter) => parameter.$ref) ?? [];
      expect(
        [...pathRefs, ...operationRefs].some((ref) => ref?.endsWith("/TenantId")),
        key,
      ).toBe(true);
    }
  });

  it("does not expose credential or document payload fields", () => {
    const serialized = JSON.stringify(document);
    expect(serialized).not.toMatch(/password|privateKey|service_role|legalDocument|rawDocument/i);
  });
});
