import { defineConfig, devices } from "@playwright/test";

const transport = process.env.JEJAK_E2E_TRANSPORT ?? "mock";
const apiUrl = process.env.NEXT_PUBLIC_JEJAK_API_URL ?? "http://127.0.0.1:3001";

export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  fullyParallel: false,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  reporter: "line",
  use: { baseURL: "http://127.0.0.1:3100", trace: "retain-on-failure", screenshot: "only-on-failure" },
  webServer: {
    command: "pnpm --filter web dev --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
    timeout: 120_000,
    env: { NEXT_PUBLIC_JEJAK_TRANSPORT: transport, NEXT_PUBLIC_JEJAK_API_URL: apiUrl },
  },
  projects: [
    { name: "mock", grep: /@mock/, use: { ...devices["Desktop Chrome"] } },
    { name: "api", grep: /@api/, use: { ...devices["Desktop Chrome"] } },
  ],
});
