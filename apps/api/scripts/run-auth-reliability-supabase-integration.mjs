import { spawnSync } from "node:child_process";

const environment = {
  ...process.env,
  JEJAK_ALLOW_TEST_PROJECT_MUTATION: "true",
  NODE_ENV: "test",
};

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: environment,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`Acceptance command failed: ${command} ${args[0] ?? ""}`.trim());
  }
}

let primaryError;
try {
  run("pnpm", ["db:migrate:test-project"]);
  run("pnpm", ["exec", "tsx", "scripts/verify-auth-reliability-supabase.ts"]);
} catch (error) {
  primaryError = error;
} finally {
  try {
    run("pnpm", ["db:rollback"]);
    run("pnpm", ["db:migrate:test-project"]);
  } catch (cleanupError) {
    if (primaryError === undefined) primaryError = cleanupError;
  }
}

if (primaryError !== undefined) throw primaryError;
