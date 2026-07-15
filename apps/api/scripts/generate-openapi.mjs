import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(apiRoot, "openapi", "openapi.yaml");
const output = path.join(apiRoot, "openapi", "openapi.json");
mkdirSync(path.dirname(output), { recursive: true });

const result = spawnSync(
  "redocly",
  [
    "bundle",
    source,
    "--output",
    output,
    "--ext",
    "json",
    "--component-renaming-conflicts-severity",
    "error",
  ],
  { cwd: apiRoot, encoding: "utf8", stdio: "pipe" },
);

if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout);
  process.exit(result.status ?? 1);
}

const bundled = JSON.parse(readFileSync(output, "utf8"));
writeFileSync(output, `${JSON.stringify(bundled, null, 2)}\n`, "utf8");
process.stdout.write("Generated deterministic openapi/openapi.json.\n");
