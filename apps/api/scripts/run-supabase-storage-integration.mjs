import { spawnSync } from "node:child_process";

const result = spawnSync(
  "pnpm",
  ["exec", "tsx", "scripts/verify-supabase-storage.ts"],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      JEJAK_ALLOW_TEST_PROJECT_MUTATION: "true",
      NODE_ENV: "test",
    },
    stdio: "inherit",
  },
);

if (result.status !== 0) throw new Error("Supabase Storage integration acceptance failed.");
