import { spawnSync } from "node:child_process";

const generatedPaths = [
  "packages/domain/src/generated",
  "apps/api/openapi/openapi.json",
  "packages/api-client/src/generated",
];

const commands = [
  ["pnpm", ["domain:generate"]],
  ["pnpm", ["openapi:generate"]],
  ["pnpm", ["api-client:generate"]],
];

for (const [command, args] of commands) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const status = spawnSync(
  "git",
  ["status", "--porcelain", "--untracked-files=all", "--", ...generatedPaths],
  { encoding: "utf8" },
);

if (status.status !== 0) {
  process.stderr.write(status.stderr ?? "Unable to inspect generated files.\n");
  process.exit(status.status ?? 1);
}

if (status.stdout.trim().length > 0) {
  process.stderr.write("Generated artifacts are out of date:\n");
  process.stderr.write(status.stdout);
  process.exit(1);
}

process.stdout.write("Generated artifacts are up to date.\n");
