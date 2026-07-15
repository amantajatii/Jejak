import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const spec = path.resolve(packageRoot, "../../apps/api/openapi/openapi.json");
const output = path.join(packageRoot, "src", "generated", "schema.ts");
mkdirSync(path.dirname(output), { recursive: true });

const result = spawnSync("openapi-typescript", [spec, "--output", output], {
  cwd: packageRoot,
  encoding: "utf8",
  stdio: "pipe",
});
if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout);
  process.exit(result.status ?? 1);
}

const generated = readFileSync(output, "utf8");
const banner = "/* AUTO-GENERATED FROM apps/api/openapi/openapi.json. DO NOT EDIT. */\n";
writeFileSync(output, `${banner}${generated.replace(/^\/\*.*?\*\/\s*/s, "")}`, "utf8");
process.stdout.write("Generated deterministic OpenAPI TypeScript types.\n");
