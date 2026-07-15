import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("@jejak/config package exports", () => {
  it("publishes only the shared TypeScript configs", async () => {
    const packageJson = JSON.parse(
      await readFile(new URL("../package.json", import.meta.url), "utf8"),
    ) as { exports: Record<string, string> };

    expect(packageJson.exports).toEqual({
      "./tsconfig/base.json": "./tsconfig/base.json",
      "./tsconfig/node.json": "./tsconfig/node.json",
    });
  });
});
