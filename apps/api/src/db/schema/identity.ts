import { sql } from "drizzle-orm";
import { check, index, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import {
  actorRole,
  createdAtColumn,
  idColumn,
  invitationStatus,
  jejak,
  membershipStatus,
  recordStatus,
  safeJsonColumn,
  timestampColumn,
  updatedAtColumn,
  versionColumn,
} from "./_shared.js";

export const organizations = jejak.table(
  "organizations",
  {
    id: idColumn(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    organizationType: text("organization_type").notNull(),
    sellerSubjectSaltRef: text("seller_subject_salt_ref").notNull(),
    status: recordStatus("status").notNull().default("ACTIVE"),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
    version: versionColumn(),
  },
  (table) => [uniqueIndex("organizations_slug_uq").on(table.slug)],
);

export const userProfiles = jejak.table(
  "user_profiles",
  {
    id: idColumn(),
    authSubject: uuid("auth_subject").notNull(),
    status: recordStatus("status").notNull().default("ACTIVE"),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
    version: versionColumn(),
  },
  (table) => [uniqueIndex("user_profiles_auth_subject_uq").on(table.authSubject)],
);

export const organizationMemberships = jejak.table(
  "organization_memberships",
  {
    id: idColumn(),
    tenantId: uuid("tenant_id").notNull().references(() => organizations.id),
    userProfileId: uuid("user_profile_id").notNull().references(() => userProfiles.id),
    status: membershipStatus("status").notNull().default("INVITED"),
    activatedAt: timestampColumn("activated_at"),
    expiresAt: timestampColumn("expires_at"),
    revokedAt: timestampColumn("revoked_at"),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
    version: versionColumn(),
  },
  (table) => [
    uniqueIndex("organization_memberships_tenant_profile_uq").on(
      table.tenantId,
      table.userProfileId,
    ),
    index("organization_memberships_tenant_status_idx").on(table.tenantId, table.status),
  ],
);

export const membershipRoleGrants = jejak.table(
  "membership_role_grants",
  {
    id: idColumn(),
    tenantId: uuid("tenant_id").notNull().references(() => organizations.id),
    membershipId: uuid("membership_id").notNull().references(() => organizationMemberships.id),
    role: actorRole("role").notNull(),
    grantedByMembershipId: uuid("granted_by_membership_id"),
    reason: text("reason").notNull(),
    status: recordStatus("status").notNull().default("ACTIVE"),
    validFrom: timestampColumn("valid_from").notNull().defaultNow(),
    validUntil: timestampColumn("valid_until"),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
    version: versionColumn(),
  },
  (table) => [
    uniqueIndex("membership_role_grants_active_uq")
      .on(table.tenantId, table.membershipId, table.role)
      .where(sql`${table.status} = 'ACTIVE'`),
    check("membership_role_grants_human_role", sql`${table.role} not in ('ORACLE', 'SYSTEM')`),
  ],
);

export const resourceAssignments = jejak.table(
  "resource_assignments",
  {
    id: idColumn(),
    tenantId: uuid("tenant_id").notNull().references(() => organizations.id),
    membershipId: uuid("membership_id").notNull().references(() => organizationMemberships.id),
    resourceType: text("resource_type").notNull(),
    resourceId: uuid("resource_id").notNull(),
    capability: text("capability").notNull(),
    status: recordStatus("status").notNull().default("ACTIVE"),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
    version: versionColumn(),
  },
  (table) => [
    uniqueIndex("resource_assignments_active_uq")
      .on(
        table.tenantId,
        table.membershipId,
        table.resourceType,
        table.resourceId,
        table.capability,
      )
      .where(sql`${table.status} = 'ACTIVE'`),
  ],
);

export const institutionalInvitations = jejak.table(
  "institutional_invitations",
  {
    id: idColumn(),
    tenantId: uuid("tenant_id").notNull().references(() => organizations.id),
    emailHash: text("email_hash").notNull(),
    tokenHash: text("token_hash").notNull(),
    inviterMembershipId: uuid("inviter_membership_id")
      .notNull()
      .references(() => organizationMemberships.id),
    requestedRoles: safeJsonColumn("requested_roles"),
    status: invitationStatus("status").notNull().default("PENDING"),
    expiresAt: timestampColumn("expires_at").notNull(),
    acceptedUserProfileId: uuid("accepted_user_profile_id"),
    acceptedMembershipId: uuid("accepted_membership_id"),
    acceptedAt: timestampColumn("accepted_at"),
    revokedAt: timestampColumn("revoked_at"),
    revocationReason: text("revocation_reason"),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
    version: versionColumn(),
  },
  (table) => [
    uniqueIndex("institutional_invitations_token_hash_uq").on(table.tokenHash),
    uniqueIndex("institutional_invitations_pending_email_uq")
      .on(table.tenantId, table.emailHash)
      .where(sql`${table.status} = 'PENDING'`),
  ],
);

export const workloadIdentities = jejak.table(
  "workload_identities",
  {
    id: idColumn(),
    tenantId: uuid("tenant_id").notNull().references(() => organizations.id),
    name: text("name").notNull(),
    role: actorRole("role").notNull(),
    keyId: text("key_id"),
    verifier: text("verifier"),
    secretRef: text("secret_ref"),
    status: recordStatus("status").notNull().default("ACTIVE"),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
    version: versionColumn(),
  },
  (table) => [
    uniqueIndex("workload_identities_tenant_name_uq").on(table.tenantId, table.name),
    check("workload_identities_machine_role", sql`${table.role} in ('ORACLE', 'SYSTEM')`),
  ],
);
