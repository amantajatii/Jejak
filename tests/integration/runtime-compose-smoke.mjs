import { spawnSync } from "node:child_process";

const required = [
  "DATABASE_DIRECT_URL",
  "DATABASE_URL",
  "DEMO_JWT_SIGNING_KEY_REF",
  "JCC_SIGNER_TOKEN_REF",
  "JCC_SIGNER_URL",
  "JEJAK_CHAIN_MODE",
  "JEJAK_POSTGRES_PASSWORD",
  "RISK_SELLER_SUBJECT_SALT_REF",
];
const missing = required.filter((name) => !process.env[name]);
if (missing.length > 0) {
  process.stderr.write(`Container smoke is environment-blocked; missing names: ${missing.join(", ")}\n`);
  process.exit(2);
}

const project = `jejak-p1-10-${process.pid}`;
const compose = (args) => spawnSync("docker", ["compose", "--project-name", project, ...args], {
  encoding: "utf8",
  env: { ...process.env, JEJAK_API_PORT: "0", JEJAK_POSTGRES_PORT: "0", JEJAK_RISK_PORT: "0" },
  stdio: "pipe",
});

try {
  const up = compose(["--profile", "worker", "up", "--build", "--detach", "--wait"]);
  if (up.status !== 0) throw new Error(up.stderr || up.stdout || "Compose startup failed.");
  const status = compose(["ps", "--format", "json"]);
  if (status.status !== 0 || !status.stdout.includes("healthy")) throw new Error(status.stderr || status.stdout || "Compose services were not healthy.");
  process.stdout.write("Isolated Jejak Compose readiness smoke passed.\n");
} finally {
  compose(["down", "--volumes", "--remove-orphans"]);
}
