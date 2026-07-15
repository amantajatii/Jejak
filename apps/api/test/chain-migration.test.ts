import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = resolve(process.cwd(), "../../infrastructure/migrations/0006_broken_the_anarchist.sql");
const rollbackPath = resolve(process.cwd(), "../../infrastructure/migrations/rollbacks/0006_broken_the_anarchist.down.sql");

describe("chain/read-model migration security and query indexes", () => {
  it("forces tenant RLS, least privilege, immutable events, exact Money, and FK indexes", async () => {
    const migration = await readFile(migrationPath, "utf8");
    expect(migration).toContain("numeric(38, 0)");
    expect(migration).not.toMatch(/\b(real|double precision)\b/i);
    expect(migration).toContain("FORCE ROW LEVEL SECURITY");
    expect(migration).toContain("reject_chain_immutable_mutation");
    expect(migration).toContain("REVOKE UPDATE, DELETE, TRUNCATE ON jejak.chain_events");
    expect(migration).toContain("chain_reconciliation_expectations_submission_fk_idx");
    expect(migration).toContain("chain_reconciliation_results_expectation_fk_idx");
    expect(migration).toContain("settlement_events_append_only");
    expect(migration).toContain("waterfall_results_append_only");
    expect(migration).toContain("REVOKE UPDATE, DELETE, TRUNCATE ON jejak.settlement_events");
    expect(migration).not.toMatch(/SECURITY\s+DEFINER/i);
  });

  it("provides proportional keyset/filter indexes for stable audit queries", async () => {
    const migration = await readFile(migrationPath, "utf8");
    expect(migration).toContain('"tenant_id", "created_at" DESC, "id" DESC');
    expect(migration).toContain('"tenant_id", "action", "created_at" DESC, "id" DESC');
    expect(migration).toContain('"tenant_id", "resource_type", "created_at" DESC, "id" DESC');
    expect(migration).toContain('"tenant_id","currency","scale","issuer","state"');
    expect(migration).toContain("chain_events_waterfall_result_hash_idx");
    expect(migration).toContain("settlement_events_claim_page_idx");
    expect(migration).toContain("waterfall_results_result_hash_uq");
  });

  it("rolls back triggers, policies, tables, indexes, and checkpoint columns", async () => {
    const rollback = await readFile(rollbackPath, "utf8");
    expect(rollback).toContain("DROP TRIGGER IF EXISTS chain_events_append_only");
    expect(rollback).toContain("DROP TRIGGER IF EXISTS waterfall_results_append_only");
    expect(rollback).toContain("DROP POLICY IF EXISTS chain_events_tenant_isolation");
    expect(rollback).toContain("DROP TABLE IF EXISTS jejak.chain_events");
    expect(rollback).toContain("DROP COLUMN IF EXISTS contract_name");
    expect(rollback).toContain("DROP INDEX IF EXISTS jejak.chain_events_waterfall_result_hash_idx");
  });
});
