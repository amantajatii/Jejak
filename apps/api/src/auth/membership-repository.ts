import { and, eq, gt, isNull, lte, or } from "drizzle-orm";

import type { ResourceAssignment } from "./authorization.js";
import type { ActiveRoleGrant } from "./types.js";
import type { JejakDatabase } from "../db/client.js";
import { applyTransactionContext } from "../db/context.js";
import {
  membershipRoleGrants,
  organizationMemberships,
  resourceAssignments,
  userProfiles,
} from "../db/schema/index.js";

export type ActiveMembership = {
  actorId: string;
  grants: ActiveRoleGrant[];
  membershipId: string;
  tenantId: string;
};

export async function findActiveMembership(
  database: JejakDatabase,
  input: { authSubject: string; requestId: string; tenantId: string },
): Promise<ActiveMembership | undefined> {
  const now = new Date();
  return database.transaction(async (transaction) => {
    await applyTransactionContext(transaction, {
      actorId: input.authSubject,
      requestId: input.requestId,
      tenantId: input.tenantId,
    });
    const rows = await transaction
      .select({
        actorId: userProfiles.id,
        grantId: membershipRoleGrants.id,
        membershipId: organizationMemberships.id,
        role: membershipRoleGrants.role,
      })
      .from(userProfiles)
      .innerJoin(
        organizationMemberships,
        eq(organizationMemberships.userProfileId, userProfiles.id),
      )
      .innerJoin(
        membershipRoleGrants,
        eq(membershipRoleGrants.membershipId, organizationMemberships.id),
      )
      .where(
        and(
          eq(userProfiles.authSubject, input.authSubject),
          eq(userProfiles.status, "ACTIVE"),
          eq(organizationMemberships.tenantId, input.tenantId),
          eq(organizationMemberships.status, "ACTIVE"),
          or(isNull(organizationMemberships.expiresAt), gt(organizationMemberships.expiresAt, now)),
          eq(membershipRoleGrants.status, "ACTIVE"),
          lte(membershipRoleGrants.validFrom, now),
          or(isNull(membershipRoleGrants.validUntil), gt(membershipRoleGrants.validUntil, now)),
        ),
      );
    const first = rows[0];
    if (first === undefined) return undefined;
    return {
      actorId: first.actorId,
      grants: rows.map((row) => ({ grantId: row.grantId, role: row.role })),
      membershipId: first.membershipId,
      tenantId: input.tenantId,
    };
  });
}

export async function findActiveResourceAssignments(
  database: JejakDatabase,
  input: {
    actorId: string;
    membershipId: string;
    requestId: string;
    tenantId: string;
  },
): Promise<ResourceAssignment[]> {
  return database.transaction(async (transaction) => {
    await applyTransactionContext(transaction, {
      actorId: input.actorId,
      membershipId: input.membershipId,
      requestId: input.requestId,
      tenantId: input.tenantId,
    });
    return transaction
      .select({
        capability: resourceAssignments.capability,
        resourceId: resourceAssignments.resourceId,
        resourceType: resourceAssignments.resourceType,
      })
      .from(resourceAssignments)
      .where(
        and(
          eq(resourceAssignments.tenantId, input.tenantId),
          eq(resourceAssignments.membershipId, input.membershipId),
          eq(resourceAssignments.status, "ACTIVE"),
        ),
      );
  });
}
