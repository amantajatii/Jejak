import { describe, expect, it } from "vitest";

import { assertDedicatedTestProject } from "../scripts/migration-guard.js";
import { resolveMigrationDatabaseUrl } from "../src/db/client.js";
import { testConfig } from "./helpers.js";

const ref = "abcdefghijklmnopqrst";

describe("dedicated Supabase test-project guard", () => {
  it("prefers a direct Supabase migration endpoint without changing credentials", () => {
    expect(
      resolveMigrationDatabaseUrl(
        "postgresql://postgres.abcdefghijklmnopqrst:secret@aws-0-region.pooler.supabase.com:6543/postgres",
        "https://abcdefghijklmnopqrst.supabase.co",
      ),
    ).toBe(
      "postgresql://postgres:secret@db.abcdefghijklmnopqrst.supabase.co:5432/postgres",
    );
    expect(resolveMigrationDatabaseUrl("postgresql://user:secret@localhost:5432/jejak")).toBe(
      "postgresql://user:secret@localhost:5432/jejak",
    );
  });

  it("falls back from Supavisor transaction to session mode without project metadata", () => {
    expect(
      resolveMigrationDatabaseUrl(
        "postgresql://postgres.abcdefghijklmnopqrst:secret@aws-0-region.pooler.supabase.com:6543/postgres",
      ),
    ).toBe(
      "postgresql://postgres.abcdefghijklmnopqrst:secret@aws-0-region.pooler.supabase.com:5432/postgres",
    );
  });

  it("accepts only matching explicitly acknowledged test configuration", () => {
    expect(
      assertDedicatedTestProject(
        testConfig({
          allowTestProjectMutation: true,
          databaseDirectUrl: `postgresql://postgres.${ref}:secret@aws.pooler.supabase.com:5432/postgres`,
          supabaseTestProjectRef: ref,
          supabaseUrl: `https://${ref}.supabase.co`,
        }),
      ),
    ).toBe(ref);
  });

  it("rejects a mismatched database project", () => {
    expect(() =>
      assertDedicatedTestProject(
        testConfig({
          allowTestProjectMutation: true,
          databaseDirectUrl: "postgresql://postgres.zyxwvutsrqponmlkjihg:secret@pooler:5432/postgres",
          supabaseTestProjectRef: ref,
          supabaseUrl: `https://${ref}.supabase.co`,
        }),
      ),
    ).toThrow(/references differ/);
  });
});
