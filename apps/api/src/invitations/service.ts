import { v7 as uuidv7 } from "uuid";

import type { ActorRole } from "../auth/types.js";
import {
  createInvitationToken,
  emailHash,
  invitationTenantId,
  normalizeEmail,
  sha256,
} from "./token.js";

export type InvitationView = {
  expiresAt: Date;
  id: string;
  roles: ActorRole[];
  status: "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";
  tenantDisplayName: string;
  tenantId: string;
};

export type StoredInvitation = InvitationView & {
  emailHash: string;
  inviterMembershipId: string;
  tokenHash: string;
};

export type InvitationRepository = {
  accept(input: {
    actorEmailHash: string;
    authSubject: string;
    now: Date;
    requestId: string;
    tenantId: string;
    tokenHash: string;
  }): Promise<InvitationView | undefined>;
  create(input: StoredInvitation & { actorId: string; requestId: string; roleGrantId: string }): Promise<InvitationView>;
  find(input: { tenantId: string; tokenHash: string }): Promise<StoredInvitation | undefined>;
  revoke(input: {
    id: string;
    actorId: string;
    reason: string;
    requestId: string;
    roleGrantId: string;
    tenantId: string;
  }): Promise<InvitationView | undefined>;
};

export class InvitationError extends Error {
  constructor(
    readonly code:
      | "INVITATION_EMAIL_MISMATCH"
      | "INVITATION_EXPIRED"
      | "INVITATION_INVALID"
      | "INVITATION_REVOKED",
  ) {
    super("The invitation cannot be used.");
    this.name = "InvitationError";
  }
}

const institutionalRoles = new Set<ActorRole>([
  "ORIGINATOR",
  "ISSUER",
  "FACILITY",
  "SERVICER",
  "RESOLVER",
  "ADMIN",
]);

export class InvitationService {
  constructor(
    private readonly repository: InvitationRepository,
    private readonly ttlMilliseconds = 72 * 60 * 60 * 1_000,
  ) {}

  async create(input: {
    email: string;
    actorId: string;
    inviterMembershipId: string;
    requestId: string;
    roles: ActorRole[];
    roleGrantId: string;
    tenantDisplayName: string;
    tenantId: string;
  }): Promise<InvitationView & { token: string }> {
    if (input.roles.length === 0 || input.roles.some((role) => !institutionalRoles.has(role))) {
      throw new InvitationError("INVITATION_INVALID");
    }
    const token = createInvitationToken(input.tenantId);
    const view = await this.repository.create({
      emailHash: emailHash(input.email),
      actorId: input.actorId,
      expiresAt: new Date(Date.now() + this.ttlMilliseconds),
      id: uuidv7(),
      inviterMembershipId: input.inviterMembershipId,
      requestId: input.requestId,
      roles: [...new Set(input.roles)],
      roleGrantId: input.roleGrantId,
      status: "PENDING",
      tenantDisplayName: input.tenantDisplayName,
      tenantId: input.tenantId,
      tokenHash: sha256(token),
    });
    return { ...view, token };
  }

  async preview(token: string, now = new Date()): Promise<InvitationView> {
    const tenantId = invitationTenantId(token);
    const invitation = await this.repository.find({ tenantId, tokenHash: sha256(token) });
    return this.#validate(invitation, now);
  }

  async accept(input: {
    actorEmail: string | undefined;
    authSubject: string;
    requestId: string;
    token: string;
  }): Promise<InvitationView> {
    if (input.actorEmail === undefined) throw new InvitationError("INVITATION_EMAIL_MISMATCH");
    const tenantId = invitationTenantId(input.token);
    const current = this.#validate(
      await this.repository.find({ tenantId, tokenHash: sha256(input.token) }),
      new Date(),
    );
    const actorEmailHash = emailHash(normalizeEmail(input.actorEmail));
    const stored = await this.repository.find({ tenantId, tokenHash: sha256(input.token) });
    if (stored?.emailHash !== actorEmailHash) throw new InvitationError("INVITATION_EMAIL_MISMATCH");
    const accepted = await this.repository.accept({
      actorEmailHash,
      authSubject: input.authSubject,
      now: new Date(),
      requestId: input.requestId,
      tenantId: current.tenantId,
      tokenHash: sha256(input.token),
    });
    if (accepted === undefined) throw new InvitationError("INVITATION_INVALID");
    return accepted;
  }

  async revoke(input: {
    id: string;
    actorId: string;
    reason: string;
    requestId: string;
    roleGrantId: string;
    tenantId: string;
  }): Promise<InvitationView> {
    const result = await this.repository.revoke(input);
    if (result === undefined) throw new InvitationError("INVITATION_INVALID");
    return result;
  }

  #validate(invitation: StoredInvitation | undefined, now: Date): InvitationView {
    if (invitation === undefined) throw new InvitationError("INVITATION_INVALID");
    if (invitation.status === "REVOKED") throw new InvitationError("INVITATION_REVOKED");
    if (invitation.status !== "PENDING") throw new InvitationError("INVITATION_INVALID");
    if (invitation.expiresAt <= now) throw new InvitationError("INVITATION_EXPIRED");
    const { emailHash: _emailHash, inviterMembershipId: _inviter, tokenHash: _token, ...view } = invitation;
    return view;
  }
}
