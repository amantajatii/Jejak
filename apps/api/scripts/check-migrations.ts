import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(process.cwd(), "../../infrastructure/migrations");
const initial = await readFile(resolve(root, "0000_keen_shiver_man.sql"), "utf8");
const security = await readFile(resolve(root, "0001_security_foundation.sql"), "utf8");
const lifecycle = await readFile(resolve(root, "0002_lucky_molly_hayes.sql"), "utf8");
const settlementMoneyGuard = await readFile(resolve(root, "0003_orange_maginty.sql"), "utf8");
const claimEncumbranceGuard = await readFile(resolve(root, "0004_hot_doctor_faustus.sql"), "utf8");
const rollback0 = await readFile(resolve(root, "rollbacks/0000_keen_shiver_man.down.sql"), "utf8");
const rollback1 = await readFile(resolve(root, "rollbacks/0001_security_foundation.down.sql"), "utf8");
const rollback2 = await readFile(resolve(root, "rollbacks/0002_lucky_molly_hayes.down.sql"), "utf8");
const rollback3 = await readFile(resolve(root, "rollbacks/0003_orange_maginty.down.sql"), "utf8");
const rollback4 = await readFile(resolve(root, "rollbacks/0004_hot_doctor_faustus.down.sql"), "utf8");

const failures: string[] = [];
const requireText = (text: string, pattern: RegExp, message: string) => {
  if (!pattern.test(text)) failures.push(message);
};

requireText(initial, /CREATE SCHEMA "jejak"/, "initial migration must create the private jejak schema");
requireText(initial, /numeric\(38, 0\)/, "money must use numeric(38,0)");
if (/\b(real|double precision)\b/i.test(initial)) failures.push("floating-point money type found");
requireText(security, /NOBYPASSRLS/g, "runtime roles must not bypass RLS");
requireText(security, /FORCE ROW LEVEL SECURITY/g, "RLS must be forced");
requireText(security, /current_setting\('jejak\.tenant_id', true\)/g, "tenant policy context is missing");
requireText(security, /REVOKE ALL ON SCHEMA jejak FROM PUBLIC, anon, authenticated, service_role/, "exposed roles must have no schema grants");
if (/SECURITY\s+DEFINER/i.test(security)) failures.push("SECURITY DEFINER is forbidden");
if (/SECURITY\s+DEFINER/i.test(lifecycle)) failures.push("lifecycle SECURITY DEFINER is forbidden");
requireText(rollback0, /DROP SCHEMA IF EXISTS jejak CASCADE/, "base rollback is missing");
requireText(rollback1, /DROP POLICY IF EXISTS/, "security rollback is missing");
requireText(lifecycle, /reject_lifecycle_immutable_mutation/, "lifecycle append-only guard is missing");
requireText(lifecycle, /REVOKE UPDATE, DELETE, TRUNCATE ON/, "lifecycle immutable grants are missing");
requireText(settlementMoneyGuard, /between 0 and 18/, "settlement Money scale guard is missing");
requireText(rollback2, /DROP TABLE IF EXISTS jejak\.risk_evaluations/, "lifecycle rollback is missing");
requireText(rollback3, /DROP CONSTRAINT IF EXISTS settlement_streams_expected_settlement_scale/, "Money guard rollback is missing");
requireText(claimEncumbranceGuard, /claims_active_snapshot_uq/, "active snapshot encumbrance guard is missing");
requireText(rollback4, /DROP INDEX IF EXISTS jejak\.claims_active_snapshot_uq/, "encumbrance guard rollback is missing");

const tenantTables = [...initial.matchAll(/CREATE TABLE "jejak"\."([^"]+)" \([\s\S]*?\n\);/g)]
  .filter((match) => match[0].includes('"tenant_id" uuid NOT NULL'))
  .map((match) => match[1]);
for (const table of tenantTables) {
  if (table !== undefined && !security.includes(`('${table}')`)) {
    failures.push(`tenant table ${table} is absent from the RLS policy migration`);
  }
}

const lifecycleTenantTables = [...lifecycle.matchAll(/CREATE TABLE "jejak"\."([^"]+)" \([\s\S]*?\n\);/g)]
  .filter((match) => match[0].includes('"tenant_id" uuid NOT NULL'))
  .map((match) => match[1]);
for (const table of lifecycleTenantTables) {
  if (table !== undefined && !lifecycle.includes(`('${table}')`)) {
    failures.push(`lifecycle tenant table ${table} is absent from its RLS policy migration`);
  }
}

if (failures.length > 0) throw new Error(`Migration security check failed:\n- ${failures.join("\n- ")}`);
console.log(
  `Migration security check passed for ${tenantTables.length + lifecycleTenantTables.length} tenant tables.`,
);
