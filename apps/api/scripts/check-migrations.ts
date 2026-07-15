import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(process.cwd(), "../../infrastructure/migrations");
const initial = await readFile(resolve(root, "0000_keen_shiver_man.sql"), "utf8");
const security = await readFile(resolve(root, "0001_security_foundation.sql"), "utf8");
const rollback0 = await readFile(resolve(root, "rollbacks/0000_keen_shiver_man.down.sql"), "utf8");
const rollback1 = await readFile(resolve(root, "rollbacks/0001_security_foundation.down.sql"), "utf8");

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
requireText(rollback0, /DROP SCHEMA IF EXISTS jejak CASCADE/, "base rollback is missing");
requireText(rollback1, /DROP POLICY IF EXISTS/, "security rollback is missing");

const tenantTables = [...initial.matchAll(/CREATE TABLE "jejak"\."([^"]+)" \([\s\S]*?\n\);/g)]
  .filter((match) => match[0].includes('"tenant_id" uuid NOT NULL'))
  .map((match) => match[1]);
for (const table of tenantTables) {
  if (table !== undefined && !security.includes(`('${table}')`)) {
    failures.push(`tenant table ${table} is absent from the RLS policy migration`);
  }
}

if (failures.length > 0) throw new Error(`Migration security check failed:\n- ${failures.join("\n- ")}`);
console.log(`Migration security check passed for ${tenantTables.length} tenant tables.`);
