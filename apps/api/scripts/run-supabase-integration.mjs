import { spawnSync } from "node:child_process";

const environment = {
  ...process.env,
  JEJAK_ALLOW_TEST_PROJECT_MUTATION: "true",
  NODE_ENV: "test",
};

function run(args) {
  const result = spawnSync("pnpm", args, { cwd: process.cwd(), env: environment, stdio: "inherit" });
  if (result.status !== 0) throw new Error(`Command failed: pnpm ${args.join(" ")}`);
}

let primaryError;
try {
  run(["db:migrate"]);
  run(["exec", "tsx", "scripts/verify-supabase.ts"]);
} catch (error) {
  primaryError = error;
} finally {
  try {
    run(["db:rollback"]);
    run(["db:migrate"]);
  } catch (cleanupError) {
    if (primaryError === undefined) primaryError = cleanupError;
  }
}

if (primaryError !== undefined) throw primaryError;
