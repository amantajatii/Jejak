import { and, eq, gt, isNull, lte, or } from "drizzle-orm";

import { applyTransactionContext } from "../../db/context.js";
import type { JejakDatabase } from "../../db/client.js";
import {
  membershipRoleGrants,
  organizationMemberships,
  userProfiles,
  workloadIdentities,
} from "../../db/schema/index.js";
import type { ActorRole } from "../../auth/types.js";
import type { DemoActor, DemoActorRegistry } from "./identity.js";

export class PostgresDemoActorRegistry implements DemoActorRegistry {
  constructor(private readonly database: JejakDatabase) {}

  findByRole(input: { role: ActorRole; tenantId: string }): Promise<DemoActor | undefined> {
    return this.#find(input);
  }

  findCanonical(input: DemoActor): Promise<DemoActor | undefined> {
    return this.#find(input);
  }

  async #find(input: { actorId?: string; role: ActorRole; tenantId: string }): Promise<DemoActor | undefined> {
    return this.database.transaction(async (transaction) => {
      await applyTransactionContext(transaction, {
        actorId: input.tenantId,
        requestId: input.tenantId,
        tenantId: input.tenantId,
      });
      const now = new Date();
      if (input.role === "SYSTEM" || input.role === "ORACLE") {
        const [row] = await transaction.select({ actorId: workloadIdentities.id })
          .from(workloadIdentities)
          .where(and(
            eq(workloadIdentities.tenantId, input.tenantId),
            eq(workloadIdentities.role, input.role),
            eq(workloadIdentities.status, "ACTIVE"),
            ...(input.actorId === undefined ? [] : [eq(workloadIdentities.id, input.actorId)]),
          )).limit(1);
        return row === undefined ? undefined : { actorId: row.actorId, role: input.role, tenantId: input.tenantId };
      }

      const [row] = await transaction.select({ actorId: userProfiles.authSubject })
        .from(userProfiles)
        .innerJoin(organizationMemberships, eq(organizationMemberships.userProfileId, userProfiles.id))
        .innerJoin(membershipRoleGrants, eq(membershipRoleGrants.membershipId, organizationMemberships.id))
        .where(and(
          eq(organizationMemberships.tenantId, input.tenantId),
          eq(organizationMemberships.status, "ACTIVE"),
          or(isNull(organizationMemberships.expiresAt), gt(organizationMemberships.expiresAt, now)),
          eq(userProfiles.status, "ACTIVE"),
          eq(membershipRoleGrants.role, input.role),
          eq(membershipRoleGrants.status, "ACTIVE"),
          lte(membershipRoleGrants.validFrom, now),
          or(isNull(membershipRoleGrants.validUntil), gt(membershipRoleGrants.validUntil, now)),
          ...(input.actorId === undefined ? [] : [eq(userProfiles.authSubject, input.actorId)]),
        )).limit(1);
      return row === undefined ? undefined : { actorId: row.actorId, role: input.role, tenantId: input.tenantId };
    });
  }
}
