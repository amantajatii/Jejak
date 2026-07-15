import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const environment = {
  ...process.env,
  JEJAK_ALLOW_TEST_PROJECT_MUTATION: "true",
  NODE_ENV: "test",
};
const apiDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function run(args) {
  const result = spawnSync("pnpm", args, {
    cwd: apiDirectory,
    env: environment,
    stdio: "inherit",
  });
  if (result.status !== 0) throw new Error(`Acceptance command failed: pnpm ${args.join(" ")}`);
}

let primaryError;
try {
  // Existing dedicated test projects may have recorded the prior 0006 hash. Resetting the
  // application schema makes this guarded run validate the checked-in migration sources.
  run(["db:rollback"]);
  run(["db:migrate:test-project"]);
  run(["exec", "tsx", "scripts/verify-settlement-offers-supabase.ts"]);
} catch (error) {
  primaryError = error;
} finally {
  try {
    run(["db:rollback"]);
    run(["db:migrate:test-project"]);
    run(["exec", "tsx", "scripts/verify-settlement-offers-supabase.ts", "--catalog-only"]);
  } catch (restoreError) {
    primaryError =
      primaryError === undefined
        ? restoreError
        : new AggregateError([primaryError, restoreError], "Acceptance and final restore both failed.");
  }
}

if (primaryError !== undefined) throw primaryError;
