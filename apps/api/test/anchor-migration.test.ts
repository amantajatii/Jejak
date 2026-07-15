import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migrations = resolve(process.cwd(), "../../infrastructure/migrations");
const forward = await readFile(resolve(migrations, "0005_lame_ultron.sql"), "utf8");
const rollback = await readFile(
  resolve(migrations, "rollbacks/0005_lame_ultron.down.sql"),
  "utf8",
);

describe("anchor payout receipt migration", () => {
  it("stores exact balanced Money with idempotency and reconciliation indexes", () => {
    expect(forward).toContain('CREATE TABLE "jejak"."anchor_payout_receipts"');
    expect(forward).toContain("numeric(38, 0)");
    expect(forward).toContain("anchor_payout_receipts_balanced");
    expect(forward).toContain("anchor_payout_receipts_idempotency_uq");
    expect(forward).toContain("anchor_payout_receipts_operation_idx");
    expect(forward).not.toMatch(/\b(real|double precision)\b/i);
  });

  it("forces tenant RLS, blocks Data API roles, and keeps receipts immutable", () => {
    expect(forward).toContain("FORCE ROW LEVEL SECURITY");
    expect(forward).toContain("TO jejak_api, jejak_worker");
    expect(forward).toContain("current_setting('jejak.tenant_id', true)");
    expect(forward).toContain("FROM PUBLIC, anon, authenticated, service_role");
    expect(forward).toContain("REVOKE UPDATE, DELETE, TRUNCATE");
  });

  it("has an explicit rollback", () => {
    expect(rollback).toContain("DROP POLICY IF EXISTS anchor_payout_receipts_tenant_isolation");
    expect(rollback).toContain("DROP TABLE IF EXISTS jejak.anchor_payout_receipts");
  });
});

