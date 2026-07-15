import { describe, expect, it } from "vitest";

import type { InvitationRepository, StoredInvitation } from "../src/invitations/service.js";
import { InvitationError, InvitationService } from "../src/invitations/service.js";
import { emailHash } from "../src/invitations/token.js";

const tenantId = "01980a12-3456-789a-8abc-def012345678";

class MemoryInvitations implements InvitationRepository {
  records = new Map<string, StoredInvitation>();

  async create(input: StoredInvitation): Promise<StoredInvitation> {
    this.records.set(input.tokenHash, input);
    return input;
  }

  async find(input: { tokenHash: string }): Promise<StoredInvitation | undefined> {
    return this.records.get(input.tokenHash);
  }

  async accept(input: { actorEmailHash: string; tokenHash: string }): Promise<StoredInvitation | undefined> {
    const row = this.records.get(input.tokenHash);
    if (row === undefined || row.emailHash !== input.actorEmailHash || row.status !== "PENDING") return undefined;
    row.status = "ACCEPTED";
    return row;
  }

  async revoke(input: { id: string }): Promise<StoredInvitation | undefined> {
    const row = [...this.records.values()].find((candidate) => candidate.id === input.id);
    if (row === undefined) return undefined;
    row.status = "REVOKED";
    return row;
  }
}

describe("institutional invitation service", () => {
  it("stores only hashes and returns the raw high-entropy token once", async () => {
    const repository = new MemoryInvitations();
    const service = new InvitationService(repository);
    const created = await service.create({
      actorId: tenantId,
      email: " Member@Example.Test ",
      inviterMembershipId: tenantId,
      requestId: tenantId,
      roles: ["ORIGINATOR"],
      roleGrantId: tenantId,
      tenantDisplayName: "Test Originator",
      tenantId,
    });
    expect(created.token).toHaveLength(80);
    expect([...repository.records.values()][0]?.emailHash).toBe(emailHash("member@example.test"));
    expect(JSON.stringify([...repository.records.values()])).not.toContain(created.token);
  });

  it("accepts only the authenticated matching email and rejects replay", async () => {
    const repository = new MemoryInvitations();
    const service = new InvitationService(repository);
    const created = await service.create({
      actorId: tenantId,
      email: "member@example.test",
      inviterMembershipId: tenantId,
      requestId: tenantId,
      roles: ["FACILITY"],
      roleGrantId: tenantId,
      tenantDisplayName: "Test Facility",
      tenantId,
    });
    await expect(
      service.accept({ actorEmail: "other@example.test", authSubject: tenantId, requestId: tenantId, token: created.token }),
    ).rejects.toMatchObject({ code: "INVITATION_EMAIL_MISMATCH" });
    await expect(
      service.accept({ actorEmail: "member@example.test", authSubject: tenantId, requestId: tenantId, token: created.token }),
    ).resolves.toMatchObject({ status: "ACCEPTED" });
    await expect(service.preview(created.token)).rejects.toBeInstanceOf(InvitationError);
  });

  it("revokes idempotently without making the token usable", async () => {
    const repository = new MemoryInvitations();
    const service = new InvitationService(repository);
    const created = await service.create({
      actorId: tenantId, email: "member@example.test", inviterMembershipId: tenantId, requestId: tenantId,
      roleGrantId: tenantId, roles: ["SERVICER"], tenantDisplayName: "Test Servicer", tenantId,
    });
    await expect(service.revoke({ actorId: tenantId, id: created.id, reason: "superseded", requestId: tenantId, roleGrantId: tenantId, tenantId }))
      .resolves.toMatchObject({ status: "REVOKED" });
    await expect(service.revoke({ actorId: tenantId, id: created.id, reason: "superseded", requestId: tenantId, roleGrantId: tenantId, tenantId }))
      .resolves.toMatchObject({ status: "REVOKED" });
    await expect(service.preview(created.token)).rejects.toMatchObject({ code: "INVITATION_REVOKED" });
  });
});
