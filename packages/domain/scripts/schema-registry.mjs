import { globSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const schemasRoot = path.join(packageRoot, "schemas");

export function loadSchemas() {
  const files = globSync("**/*.schema.json", { cwd: schemasRoot }).sort();
  const ids = new Set();

  return files.map((relativePath) => {
    const absolutePath = path.join(schemasRoot, relativePath);
    const schema = JSON.parse(readFileSync(absolutePath, "utf8"));

    if (typeof schema.$id !== "string" || schema.$id.length === 0) {
      throw new Error(`Schema ${relativePath} is missing a non-empty $id.`);
    }
    if (ids.has(schema.$id)) {
      throw new Error(`Duplicate schema $id: ${schema.$id}`);
    }
    ids.add(schema.$id);

    return { absolutePath, relativePath, schema };
  });
}
