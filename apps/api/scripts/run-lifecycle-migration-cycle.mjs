import { spawnSync } from "node:child_process";

const environment = {
  ...process.env,
  JEJAK_ALLOW_TEST_PROJECT_MUTATION: "true",
  NODE_ENV: "test",
};

function run(args) {
  const result = spawnSync("pnpm", args, {
    cwd: process.cwd(),
    env: environment,
    stdio: "inherit",
  });
  if (result.status !== 0) throw new Error(`Command failed: pnpm ${args.join(" ")}`);
}

const verifyAndMigrate = () =>
  run(["exec", "tsx", "scripts/verify-lifecycle-supabase.ts", "--migrate"]);

let primaryError;
try {
  verifyAndMigrate();
  run(["db:rollback"]);
  verifyAndMigrate();
} catch (error) {
  primaryError = error;
} finally {
  if (primaryError !== undefined) {
    try {
      verifyAndMigrate();
    } catch (restoreError) {
      primaryError = new AggregateError(
        [primaryError, restoreError],
        "Lifecycle migration cycle and final restore both failed.",
      );
    }
  }
}

if (primaryError !== undefined) throw primaryError;
