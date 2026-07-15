const baseUrl = (process.env.JEJAK_API_BASE_URL ?? "http://127.0.0.1:4000").replace(/\/$/, "");
const [command, ...args] = process.argv.slice(2);

if (command === "reset") {
  const scenario = args[0];
  if (scenario !== "HAPPY" && scenario !== "ADVERSE") fail("Usage: demo-flow.mjs reset HAPPY|ADVERSE [idempotency-key]");
  const key = args[1] ?? `demo-reset-${scenario.toLowerCase()}-${Date.now()}`;
  print(await request("/v1/demo/reset", { body: { scenario }, headers: { "idempotency-key": key }, method: "POST" }));
} else if (command === "session") {
  const [tenantId, role, key = `demo-session-${Date.now()}`] = args;
  if (!tenantId || !role) fail("Usage: demo-flow.mjs session TENANT_ID ROLE [idempotency-key]");
  print(await request("/v1/demo/sessions", {
    body: { role },
    headers: { "idempotency-key": key, "x-jejak-tenant-id": tenantId },
    method: "POST",
  }));
} else if (command === "workspace") {
  const [tenantId, claimId] = args;
  const token = process.env.JEJAK_DEMO_ACCESS_TOKEN;
  if (!tenantId || !claimId || !token) fail("workspace requires TENANT_ID, CLAIM_ID, and an in-memory JEJAK_DEMO_ACCESS_TOKEN.");
  const interval = Number(process.env.JEJAK_WORKSPACE_POLL_INTERVAL_MS ?? "1000");
  do {
    const envelope = await request(`/v1/claims/${claimId}/workspace`, {
      headers: { authorization: `Bearer ${token}`, "x-jejak-tenant-id": tenantId },
      method: "GET",
    });
    print(envelope);
    if (process.env.JEJAK_WORKSPACE_POLL_ONCE === "true") break;
    await new Promise((resolve) => setTimeout(resolve, interval));
  } while (true);
} else {
  fail("Usage: demo-flow.mjs reset|session|workspace ...");
}

async function request(path, input) {
  const response = await fetch(`${baseUrl}${path}`, {
    body: input.body === undefined ? undefined : JSON.stringify(input.body),
    headers: { accept: "application/json", ...(input.body === undefined ? {} : { "content-type": "application/json" }), ...input.headers },
    method: input.method,
  });
  const body = await response.json().catch(() => ({ error: { message: "Non-JSON response." } }));
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${JSON.stringify(body)}`);
  return body;
}

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}
