import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(process.cwd(), "../../infrastructure/migrations");
const initial = await readFile(resolve(root, "0000_keen_shiver_man.sql"), "utf8");
const security = await readFile(resolve(root, "0001_security_foundation.sql"), "utf8");
const lifecycle = await readFile(resolve(root, "0002_lucky_molly_hayes.sql"), "utf8");
const settlementMoneyGuard = await readFile(resolve(root, "0003_orange_maginty.sql"), "utf8");
const claimEncumbranceGuard = await readFile(resolve(root, "0004_hot_doctor_faustus.sql"), "utf8");
const anchor = await readFile(resolve(root, "0005_lame_ultron.sql"), "utf8");
const chainReadModels = await readFile(resolve(root, "0006_broken_the_anarchist.sql"), "utf8");
const rollback0 = await readFile(resolve(root, "rollbacks/0000_keen_shiver_man.down.sql"), "utf8");
const rollback1 = await readFile(resolve(root, "rollbacks/0001_security_foundation.down.sql"), "utf8");
const rollback2 = await readFile(resolve(root, "rollbacks/0002_lucky_molly_hayes.down.sql"), "utf8");
const rollback3 = await readFile(resolve(root, "rollbacks/0003_orange_maginty.down.sql"), "utf8");
const rollback4 = await readFile(resolve(root, "rollbacks/0004_hot_doctor_faustus.down.sql"), "utf8");
const rollback5 = await readFile(resolve(root, "rollbacks/0005_lame_ultron.down.sql"), "utf8");
const rollback6 = await readFile(resolve(root, "rollbacks/0006_broken_the_anarchist.down.sql"), "utf8");

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
requireText(anchor, /CREATE TABLE "jejak"\."anchor_payout_receipts"/, "anchor receipt table is missing");
requireText(anchor, /numeric\(38, 0\)/, "anchor Money must use numeric(38,0)");
requireText(anchor, /FORCE ROW LEVEL SECURITY/, "anchor receipt RLS must be forced");
requireText(anchor, /current_setting\('jejak\.tenant_id', true\)/, "anchor tenant policy context is missing");
requireText(anchor, /REVOKE UPDATE, DELETE, TRUNCATE/, "anchor receipts must be immutable");
requireText(rollback5, /DROP TABLE IF EXISTS jejak\.anchor_payout_receipts/, "anchor rollback is missing");
if (/\b(real|double precision)\b/i.test(anchor)) failures.push("floating-point anchor Money type found");
requireText(chainReadModels, /CREATE TABLE "jejak"\."chain_events"/, "canonical chain event table is missing");
requireText(chainReadModels, /CREATE TABLE "jejak"\."chain_portfolio_positions"/, "chain portfolio projection is missing");
requireText(chainReadModels, /numeric\(38, 0\)/, "chain projection Money must use numeric(38,0)");
requireText(chainReadModels, /FORCE ROW LEVEL SECURITY/, "chain read-model RLS must be forced");
requireText(chainReadModels, /current_setting\(''jejak\.tenant_id'', true\)/, "chain tenant policy context is missing");
requireText(chainReadModels, /reject_chain_immutable_mutation/, "chain immutable event trigger is missing");
requireText(chainReadModels, /REVOKE UPDATE, DELETE, TRUNCATE ON jejak\.chain_events/, "canonical events must be immutable by grant");
requireText(chainReadModels, /audit_events_tenant_page_idx/, "audit keyset pagination index is missing");
requireText(chainReadModels, /chain_events_waterfall_result_hash_idx/, "waterfall result_hash reconciliation index is missing");
requireText(chainReadModels, /settlement_events_claim_page_idx/, "settlement claim pagination index is missing");
requireText(chainReadModels, /waterfall_results_result_hash_uq/, "waterfall replay constraint is missing");
requireText(chainReadModels, /settlement_events_append_only/, "settlement event immutability is missing");
requireText(chainReadModels, /waterfall_results_append_only/, "waterfall result immutability is missing");
requireText(chainReadModels, /chain_reconciliation_expectations_submission_fk_idx/, "reconciliation submission FK index is missing");
requireText(rollback6, /DROP TABLE IF EXISTS jejak\.chain_events/, "chain read-model rollback is missing");
requireText(rollback6, /DROP COLUMN IF EXISTS contract_name/, "checkpoint rollback is missing");
requireText(rollback6, /DROP TRIGGER IF EXISTS waterfall_results_append_only/, "waterfall immutability rollback is missing");
requireText(rollback6, /DROP INDEX IF EXISTS jejak\.chain_events_waterfall_result_hash_idx/, "waterfall hash index rollback is missing");
if (/\b(real|double precision)\b/i.test(chainReadModels)) failures.push("floating-point chain Money type found");
if (/SECURITY\s+DEFINER/i.test(chainReadModels)) failures.push("chain SECURITY DEFINER is forbidden");

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

const anchorTenantTables = [...anchor.matchAll(/CREATE TABLE "jejak"\."([^"]+)" \([\s\S]*?\n\);/g)]
  .filter((match) => match[0].includes('"tenant_id" uuid NOT NULL'))
  .map((match) => match[1]);
for (const table of anchorTenantTables) {
  if (table !== undefined && !anchor.includes(`CREATE POLICY ${table}_tenant_isolation`)) {
    failures.push(`anchor tenant table ${table} is absent from its RLS policy migration`);
  }
}

const chainTenantTables = [...chainReadModels.matchAll(/CREATE TABLE "jejak"\."([^"]+)" \([\s\S]*?\n\);/g)]
  .filter((match) => match[0].includes('"tenant_id" uuid NOT NULL'))
  .map((match) => match[1]);
for (const table of chainTenantTables) {
  if (table !== undefined && !chainReadModels.includes(`('${table}')`)) {
    failures.push(`chain tenant table ${table} is absent from its RLS policy migration`);
  }
}

if (failures.length > 0) throw new Error(`Migration security check failed:\n- ${failures.join("\n- ")}`);
console.log(
  `Migration security check passed for ${tenantTables.length + lifecycleTenantTables.length + anchorTenantTables.length + chainTenantTables.length} tenant tables.`,
);
