import type { ActiveRoleGrant, ActorRole, AuthorizationContext } from "./types.js";

export class AuthorizationError extends Error {
  readonly code = "FORBIDDEN";

  constructor() {
    super("The actor is not authorized for this operation.");
    this.name = "AuthorizationError";
  }
}

export type ResourceAssignment = {
  capability: string;
  resourceId: string;
  resourceType: string;
};

export type AuthorizationInput = {
  actorId: string;
  assignments?: ResourceAssignment[];
  grants: ActiveRoleGrant[];
  membershipId: string;
  requiredRoles: readonly ActorRole[];
  resource?: ResourceAssignment;
  tenantId: string;
};

export function authorize(input: AuthorizationInput): AuthorizationContext {
  const grant = input.requiredRoles
    .map((role) => input.grants.find((candidate) => candidate.role === role))
    .find((candidate) => candidate !== undefined);
  if (grant === undefined) throw new AuthorizationError();

  if (input.resource !== undefined && grant.role !== "ADMIN") {
    const assigned = input.assignments?.some(
      (candidate) =>
        candidate.resourceType === input.resource?.resourceType &&
        candidate.resourceId === input.resource.resourceId &&
        candidate.capability === input.resource.capability,
    );
    if (!assigned) throw new AuthorizationError();
  }

  return {
    actorId: input.actorId,
    membershipId: input.membershipId,
    role: grant.role,
    roleGrantId: grant.grantId,
    tenantId: input.tenantId,
  };
}
