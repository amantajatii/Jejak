import { and, eq, gt, isNull, or } from "drizzle-orm";

import type { ActiveRoleGrant } from "./types.js";
import type { JejakDatabase } from "../db/client.js";
import { applyTransactionContext } from "../db/context.js";
import {
  membershipRoleGrants,
  organizationMemberships,
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
          or(isNull(organizationMemberships.expiresAt), gt(organizationMemberships.expiresAt, new Date())),
          eq(membershipRoleGrants.status, "ACTIVE"),
          or(isNull(membershipRoleGrants.validUntil), gt(membershipRoleGrants.validUntil, new Date())),
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
