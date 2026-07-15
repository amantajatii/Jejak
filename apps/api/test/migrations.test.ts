import { describe, expect, it } from "vitest";

import { assertDedicatedTestProject } from "../scripts/migration-guard.js";
import { testConfig } from "./helpers.js";

const ref = "abcdefghijklmnopqrst";

describe("dedicated Supabase test-project guard", () => {
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
