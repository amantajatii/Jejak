import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  out: "../../infrastructure/migrations",
  schema: "./src/db/schema/index.ts",
  schemaFilter: ["jejak"],
  strict: true,
  verbose: true,
});
