const baseUrl = (process.env.JEJAK_API_BASE_URL ?? "http://127.0.0.1:4000").replace(/\/$/, "");
const response = await fetch(`${baseUrl}/ready`, { headers: { accept: "application/json" } });
const envelope = await response.json().catch(() => undefined);
const dependencies = envelope?.data?.dependencies;
if (!Array.isArray(dependencies)) throw new Error("Readiness response does not contain dependency evidence.");

const required = ["supabase_postgres", "risk_evaluation_service", "canonical_jcc_signer", "chain_mode", "stellar_rpc"];
for (const name of required) {
  const dependency = dependencies.find((entry) => entry?.name === name);
  if (dependency?.status !== "healthy") throw new Error(`${name} is not healthy; Testnet readiness is not proven.`);
}
const chain = dependencies.find((entry) => entry?.name === "chain_mode");
if (!String(chain?.message).includes("Testnet")) throw new Error("Selected chain mode is not TESTNET.");
if (!response.ok) throw new Error(`API readiness returned HTTP ${response.status}.`);
process.stdout.write("Configured Testnet dependencies passed live readiness probes. No transaction was submitted.\n");
