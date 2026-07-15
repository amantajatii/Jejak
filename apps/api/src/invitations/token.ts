import { createHash, randomBytes } from "node:crypto";

const uuidV7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeEmail(email: string): string {
  return email.normalize("NFKC").trim().toLocaleLowerCase("en-US");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function emailHash(email: string): string {
  return sha256(normalizeEmail(email));
}

export function createInvitationToken(tenantId: string): string {
  if (!uuidV7.test(tenantId)) throw new Error("Invitation tenant must be UUIDv7.");
  return `${tenantId}.${randomBytes(32).toString("base64url")}`;
}

export function invitationTenantId(token: string): string {
  const tenantId = token.split(".", 1)[0];
  if (tenantId === undefined || !uuidV7.test(tenantId)) throw new InvitationTokenError();
  return tenantId.toLowerCase();
}

export class InvitationTokenError extends Error {
  readonly code = "INVITATION_INVALID";
  constructor() {
    super("The invitation is invalid or unavailable.");
  }
}
