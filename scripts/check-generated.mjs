import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

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

function snapshotGenerated() {
  const snapshot = new Map();
  const visit = (target) => {
    if (!existsSync(target)) return;
    if (statSync(target).isDirectory()) {
      for (const entry of readdirSync(target).sort()) visit(path.join(target, entry));
      return;
    }
    snapshot.set(target, createHash("sha256").update(readFileSync(target)).digest("hex"));
  };
  for (const generatedPath of generatedPaths) visit(generatedPath);
  return snapshot;
}

const beforeGeneration = snapshotGenerated();

for (const [command, args] of commands) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const afterGeneration = snapshotGenerated();
const generatedChanged =
  beforeGeneration.size !== afterGeneration.size ||
  [...beforeGeneration].some(([file, hash]) => afterGeneration.get(file) !== hash);

const status = spawnSync(
  "git",
  ["status", "--porcelain", "--untracked-files=all", "--", ...generatedPaths],
  { encoding: "utf8" },
);

if (status.status !== 0) {
  process.stderr.write(status.stderr ?? "Unable to inspect generated files.\n");
  process.exit(status.status ?? 1);
}

if (generatedChanged || status.stdout.trim().length > 0) {
  process.stderr.write("Generated artifacts are out of date:\n");
  if (generatedChanged) process.stderr.write("generation changed one or more artifacts\n");
  if (status.stdout.length > 0) process.stderr.write(status.stdout);
  process.exit(1);
}

process.stdout.write("Generated artifacts are up to date.\n");
