import { and, eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";

import type { ActorRole } from "../auth/types.js";
import type { JejakDatabase } from "../db/client.js";
import { applyTransactionContext } from "../db/context.js";
import {
  auditEvents,
  institutionalInvitations,
  membershipRoleGrants,
  organizationMemberships,
  organizations,
  outboxEvents,
  userProfiles,
} from "../db/schema/index.js";
import type { InvitationRepository, InvitationView, StoredInvitation } from "./service.js";

function toStored(row: {
  emailHash: string;
  expiresAt: Date;
  id: string;
  inviterMembershipId: string;
  requestedRoles: unknown;
  status: "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";
  tenantDisplayName: string;
  tenantId: string;
  tokenHash: string;
}): StoredInvitation {
  return { ...row, roles: row.requestedRoles as ActorRole[] };
}

export class PostgresInvitationRepository implements InvitationRepository {
  constructor(private readonly database: JejakDatabase) {}

  async create(input: StoredInvitation & { actorId: string; requestId: string; roleGrantId: string }): Promise<InvitationView> {
    return this.database.transaction(async (transaction) => {
      await applyTransactionContext(transaction, {
        actorId: input.actorId,
        membershipId: input.inviterMembershipId,
        requestId: input.requestId,
        roleGrantId: input.roleGrantId,
        tenantId: input.tenantId,
      });
      await transaction.insert(institutionalInvitations).values({
        emailHash: input.emailHash,
        expiresAt: input.expiresAt,
        id: input.id,
        inviterMembershipId: input.inviterMembershipId,
        requestedRoles: input.roles,
        tenantId: input.tenantId,
        tokenHash: input.tokenHash,
      });
      const tenantRows = await transaction
        .select({ name: organizations.name })
        .from(organizations)
        .where(eq(organizations.id, input.tenantId))
        .limit(1);
      await this.#appendSecurityRecords(transaction as JejakDatabase, {
        action: "institutional_invitation.created",
        actorId: input.actorId,
        eventType: "membership.invitation.created",
        id: input.id,
        membershipId: input.inviterMembershipId,
        payload: { invitationId: input.id, roles: input.roles },
        requestId: input.requestId,
        roleGrantId: input.roleGrantId,
        tenantId: input.tenantId,
      });
      return { ...input, tenantDisplayName: tenantRows[0]?.name ?? input.tenantDisplayName };
    });
  }

  async find(input: { tenantId: string; tokenHash: string }): Promise<StoredInvitation | undefined> {
    return this.database.transaction(async (transaction) => {
      await applyTransactionContext(transaction, {
        actorId: "00000000-0000-7000-8000-000000000000",
        requestId: uuidv7(),
        tenantId: input.tenantId,
      });
      const rows = await transaction
        .select({
          emailHash: institutionalInvitations.emailHash,
          expiresAt: institutionalInvitations.expiresAt,
          id: institutionalInvitations.id,
          inviterMembershipId: institutionalInvitations.inviterMembershipId,
          requestedRoles: institutionalInvitations.requestedRoles,
          status: institutionalInvitations.status,
          tenantDisplayName: organizations.name,
          tenantId: institutionalInvitations.tenantId,
          tokenHash: institutionalInvitations.tokenHash,
        })
        .from(institutionalInvitations)
        .innerJoin(organizations, eq(organizations.id, institutionalInvitations.tenantId))
        .where(
          and(
            eq(institutionalInvitations.tenantId, input.tenantId),
            eq(institutionalInvitations.tokenHash, input.tokenHash),
          ),
        )
        .limit(1);
      return rows[0] === undefined ? undefined : toStored(rows[0]);
    });
  }

  async accept(input: {
    actorEmailHash: string;
    authSubject: string;
    now: Date;
    requestId: string;
    tenantId: string;
    tokenHash: string;
  }): Promise<InvitationView | undefined> {
    return this.database.transaction(async (transaction) => {
      await applyTransactionContext(transaction, {
        actorId: input.authSubject,
        requestId: input.requestId,
        tenantId: input.tenantId,
      });
      const rows = await transaction
        .select({ invitation: institutionalInvitations, tenantDisplayName: organizations.name })
        .from(institutionalInvitations)
        .innerJoin(organizations, eq(organizations.id, institutionalInvitations.tenantId))
        .where(and(eq(institutionalInvitations.tenantId, input.tenantId), eq(institutionalInvitations.tokenHash, input.tokenHash)))
        .for("update")
        .limit(1);
      const locked = rows[0];
      if (
        locked === undefined ||
        locked.invitation.status !== "PENDING" ||
        locked.invitation.emailHash !== input.actorEmailHash ||
        locked.invitation.expiresAt <= input.now
      ) return undefined;

      await transaction
        .insert(userProfiles)
        .values({ authSubject: input.authSubject, id: input.authSubject, status: "ACTIVE" })
        .onConflictDoUpdate({ target: userProfiles.authSubject, set: { status: "ACTIVE", updatedAt: input.now } });
      const membershipId = uuidv7();
      const membershipRows = await transaction
        .insert(organizationMemberships)
        .values({ activatedAt: input.now, id: membershipId, status: "ACTIVE", tenantId: input.tenantId, userProfileId: input.authSubject })
        .onConflictDoUpdate({
          target: [organizationMemberships.tenantId, organizationMemberships.userProfileId],
          set: { activatedAt: input.now, revokedAt: null, status: "ACTIVE", updatedAt: input.now },
        })
        .returning({ id: organizationMemberships.id });
      const actualMembershipId = membershipRows[0]?.id;
      if (actualMembershipId === undefined) return undefined;
      const roles = locked.invitation.requestedRoles as ActorRole[];
      for (const role of roles) {
        await transaction
          .insert(membershipRoleGrants)
          .values({
            grantedByMembershipId: locked.invitation.inviterMembershipId,
            id: uuidv7(),
            membershipId: actualMembershipId,
            reason: "INSTITUTIONAL_INVITATION_ACCEPTED",
            role,
            tenantId: input.tenantId,
          })
          .onConflictDoNothing();
      }
      await transaction
        .update(institutionalInvitations)
        .set({
          acceptedAt: input.now,
          acceptedMembershipId: actualMembershipId,
          acceptedUserProfileId: input.authSubject,
          status: "ACCEPTED",
          updatedAt: input.now,
        })
        .where(eq(institutionalInvitations.id, locked.invitation.id));
      await this.#appendSecurityRecords(transaction as JejakDatabase, {
        action: "institutional_invitation.accepted",
        actorId: input.authSubject,
        eventType: "membership.invitation.accepted",
        id: locked.invitation.id,
        membershipId: actualMembershipId,
        payload: { invitationId: locked.invitation.id, membershipId: actualMembershipId, roles },
        requestId: input.requestId,
        tenantId: input.tenantId,
      });
      return {
        expiresAt: locked.invitation.expiresAt,
        id: locked.invitation.id,
        roles,
        status: "ACCEPTED",
        tenantDisplayName: locked.tenantDisplayName,
        tenantId: input.tenantId,
      };
    });
  }

  async revoke(input: {
    actorId: string;
    id: string;
    reason: string;
    requestId: string;
    roleGrantId: string;
    tenantId: string;
  }): Promise<InvitationView | undefined> {
    return this.database.transaction(async (transaction) => {
      await applyTransactionContext(transaction, {
        actorId: input.actorId,
        requestId: input.requestId,
        roleGrantId: input.roleGrantId,
        tenantId: input.tenantId,
      });
      const rows = await transaction
        .select({ invitation: institutionalInvitations, tenantDisplayName: organizations.name })
        .from(institutionalInvitations)
        .innerJoin(organizations, eq(organizations.id, institutionalInvitations.tenantId))
        .where(and(eq(institutionalInvitations.id, input.id), eq(institutionalInvitations.tenantId, input.tenantId)))
        .for("update")
        .limit(1);
      const row = rows[0];
      if (row === undefined || row.invitation.status === "ACCEPTED") return undefined;
      if (row.invitation.status === "PENDING") {
        await transaction.update(institutionalInvitations).set({
          revocationReason: input.reason, revokedAt: new Date(), status: "REVOKED", updatedAt: new Date(),
        }).where(eq(institutionalInvitations.id, input.id));
        await this.#appendSecurityRecords(transaction as JejakDatabase, {
          action: "institutional_invitation.revoked", actorId: input.actorId,
          eventType: "membership.invitation.revoked", id: input.id,
          payload: { invitationId: input.id, reason: input.reason }, requestId: input.requestId,
          roleGrantId: input.roleGrantId, tenantId: input.tenantId,
        });
      }
      return {
        expiresAt: row.invitation.expiresAt, id: row.invitation.id,
        roles: row.invitation.requestedRoles as ActorRole[], status: "REVOKED",
        tenantDisplayName: row.tenantDisplayName, tenantId: input.tenantId,
      };
    });
  }

  async #appendSecurityRecords(
    transaction: JejakDatabase,
    input: {
      action: string; actorId: string; eventType: string; id: string; membershipId?: string;
      payload: Record<string, unknown>; requestId: string; roleGrantId?: string; tenantId: string;
    },
  ): Promise<void> {
    await transaction.insert(auditEvents).values({
      action: input.action, actorId: input.actorId, id: uuidv7(), membershipId: input.membershipId,
      references: {}, requestId: input.requestId, resourceId: input.id, resourceType: "INSTITUTIONAL_INVITATION",
      result: "SUCCESS", roleGrantId: input.roleGrantId, tenantId: input.tenantId,
    });
    await transaction.insert(outboxEvents).values({
      aggregateId: input.id, aggregateType: "INSTITUTIONAL_INVITATION", aggregateVersion: 1,
      eventType: input.eventType, eventVersion: 1, id: uuidv7(), idempotencyKey: input.requestId,
      payload: input.payload, tenantId: input.tenantId,
    });
  }
}
