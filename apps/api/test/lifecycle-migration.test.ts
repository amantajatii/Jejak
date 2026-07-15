import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migrations = resolve(process.cwd(), "../../infrastructure/migrations");
const forward = await readFile(resolve(migrations, "0002_lucky_molly_hayes.sql"), "utf8");
const rollback = await readFile(
  resolve(migrations, "rollbacks/0002_lucky_molly_hayes.down.sql"),
  "utf8",
);
const moneyGuard = await readFile(resolve(migrations, "0003_orange_maginty.sql"), "utf8");
const moneyGuardRollback = await readFile(
  resolve(migrations, "rollbacks/0003_orange_maginty.down.sql"),
  "utf8",
);
const encumbranceGuard = await readFile(
  resolve(migrations, "0004_hot_doctor_faustus.sql"),
  "utf8",
);
const encumbranceRollback = await readFile(
  resolve(migrations, "rollbacks/0004_hot_doctor_faustus.down.sql"),
  "utf8",
);

const lifecycleTables = [
  "ingestion_runs",
  "ingestion_source_files",
  "marketplace_events",
  "data_quality_issues",
  "ingestion_quality_reports",
  "decision_snapshot_metadata",
  "risk_evaluations",
] as const;

describe("lifecycle migration", () => {
  it("creates private tenant-isolated lifecycle tables with integer Money", () => {
    for (const table of lifecycleTables) {
      expect(forward).toContain(`CREATE TABLE "jejak"."${table}"`);
      expect(forward).toContain(`('${table}')`);
      expect(rollback).toContain(`DROP TABLE IF EXISTS jejak.${table}`);
    }
    expect(forward).toContain("FORCE ROW LEVEL SECURITY");
    expect(forward).toContain("current_setting(''jejak.tenant_id'', true)");
    expect(forward).toContain("numeric(38, 0)");
    expect(forward).not.toMatch(/\b(real|double precision)\b/i);
  });

  it("makes snapshots, source events, reports, and evaluations append-only", () => {
    expect(forward).toContain("reject_lifecycle_immutable_mutation");
    for (const table of lifecycleTables.filter((table) => table !== "ingestion_runs")) {
      expect(forward).toContain(`('${table}')`);
    }
    expect(forward).toContain("REVOKE UPDATE, DELETE, TRUNCATE ON");
  });

  it("guards and reverses the settlement-stream Money scale", () => {
    expect(moneyGuard).toContain("settlement_streams_expected_settlement_scale");
    expect(moneyGuard).toContain("between 0 and 18");
    expect(moneyGuardRollback).toContain(
      "DROP CONSTRAINT IF EXISTS settlement_streams_expected_settlement_scale",
    );
  });

  it("prevents two active claims from encumbering one snapshot", () => {
    expect(encumbranceGuard).toContain("claims_active_snapshot_uq");
    expect(encumbranceGuard).toContain("CLOSED_WITH_LOSS");
    expect(encumbranceRollback).toContain("DROP INDEX IF EXISTS jejak.claims_active_snapshot_uq");
  });
});
