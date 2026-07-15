export class TenantHeaderError extends Error {
  readonly code = "VALIDATION_FAILED";
}

const uuidV7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseTenantId(value: string | string[] | undefined): string {
  if (typeof value !== "string" || !uuidV7.test(value)) {
    throw new TenantHeaderError("X-Jejak-Tenant-Id must be a UUIDv7 value.");
  }
  return value.toLowerCase();
}
