import type { NextConfig } from "next";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDirectory = dirname(fileURLToPath(import.meta.url));
const rootEnvPath = resolve(appDirectory, "../../.env");

if (existsSync(rootEnvPath)) {
  process.loadEnvFile(rootEnvPath);
}

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
