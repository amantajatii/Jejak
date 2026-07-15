export const humanActorRoles = [
  "SELLER",
  "ORIGINATOR",
  "ISSUER",
  "FACILITY",
  "SERVICER",
  "RESOLVER",
  "ADMIN",
] as const;

export const actorRoles = [...humanActorRoles, "ORACLE", "SYSTEM"] as const;
export type ActorRole = (typeof actorRoles)[number];

export type AuthenticatedIdentity = {
  email?: string;
  subject: string;
};

export type ActiveRoleGrant = {
  grantId: string;
  role: ActorRole;
};

export type AuthorizationContext = {
  actorId: string;
  membershipId: string;
  roleGrantId: string;
  role: ActorRole;
  tenantId: string;
};
