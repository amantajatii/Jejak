import { resolve } from "node:path";

import { v7 as uuidv7 } from "uuid";

import { loadConfig } from "../src/config/env.js";
import { createMigrationClient } from "../src/db/client.js";
import {
  auditEvents,
  membershipRoleGrants,
  organizationMemberships,
  organizations,
  userProfiles,
} from "../src/db/schema/index.js";
import { assertDedicatedTestProject } from "./migration-guard.js";

try {
  process.loadEnvFile(resolve(process.cwd(), "../../.env"));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

const [authSubject, tenantId, tenantName, tenantSlug, reason] = process.argv.slice(2);
if ([authSubject, tenantId, tenantName, tenantSlug, reason].some((value) => value === undefined || value.length === 0)) {
  throw new Error("Usage: admin:bootstrap <auth-sub> <tenant-id> <tenant-name> <tenant-slug> <reason>");
}
const config = loadConfig();
if (config.nodeEnv === "test") assertDedicatedTestProject(config);
if (config.nodeEnv === "production" && process.env.JEJAK_ALLOW_ADMIN_BOOTSTRAP !== "true") {
  throw new Error("Production bootstrap requires JEJAK_ALLOW_ADMIN_BOOTSTRAP=true.");
}
const url = config.databaseDirectUrl ?? config.databaseUrl;
if (url === undefined) throw new Error("DATABASE_DIRECT_URL or DATABASE_URL is required.");
const handle = createMigrationClient(url);

try {
  await handle.db.transaction(async (transaction) => {
    await transaction.insert(organizations).values({
      id: tenantId!, name: tenantName!, organizationType: "INSTITUTION",
      sellerSubjectSaltRef: `bootstrap:${tenantId}`, slug: tenantSlug!,
    }).onConflictDoNothing();
    await transaction.insert(userProfiles).values({ id: authSubject!, authSubject: authSubject! }).onConflictDoNothing();
    const membershipId = uuidv7();
    const memberships = await transaction.insert(organizationMemberships).values({
      activatedAt: new Date(), id: membershipId, status: "ACTIVE", tenantId: tenantId!, userProfileId: authSubject!,
    }).onConflictDoUpdate({
      target: [organizationMemberships.tenantId, organizationMemberships.userProfileId],
      set: { activatedAt: new Date(), status: "ACTIVE", updatedAt: new Date() },
    }).returning({ id: organizationMemberships.id });
    const actualMembershipId = memberships[0]?.id;
    if (actualMembershipId === undefined) throw new Error("Unable to bootstrap membership.");
    const grants = await transaction.insert(membershipRoleGrants).values({
      id: uuidv7(), membershipId: actualMembershipId, reason: reason!, role: "ADMIN", tenantId: tenantId!,
    }).onConflictDoNothing().returning({ id: membershipRoleGrants.id });
    await transaction.insert(auditEvents).values({
      action: "tenant.admin.bootstrapped", actorId: authSubject!, id: uuidv7(), membershipId: actualMembershipId,
      reasonCode: reason!, references: {}, requestId: uuidv7(), resourceId: actualMembershipId,
      resourceType: "ORGANIZATION_MEMBERSHIP", result: "SUCCESS", roleGrantId: grants[0]?.id, tenantId: tenantId!,
    });
  });
} finally {
  await handle.close();
}
