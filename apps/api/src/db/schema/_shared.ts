import { sql } from "drizzle-orm";
import {
  integer,
  jsonb,
  numeric,
  pgSchema,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const jejak = pgSchema("jejak");

export const actorRole = jejak.enum("actor_role", [
  "SELLER",
  "ORIGINATOR",
  "ISSUER",
  "FACILITY",
  "SERVICER",
  "RESOLVER",
  "ORACLE",
  "ADMIN",
  "SYSTEM",
]);

export const recordStatus = jejak.enum("record_status", ["ACTIVE", "SUSPENDED", "REVOKED"]);
export const membershipStatus = jejak.enum("membership_status", [
  "INVITED",
  "ACTIVE",
  "SUSPENDED",
  "REVOKED",
]);
export const invitationStatus = jejak.enum("invitation_status", [
  "PENDING",
  "ACCEPTED",
  "REVOKED",
  "EXPIRED",
]);
export const deliveryStatus = jejak.enum("delivery_status", [
  "PENDING",
  "PROCESSING",
  "PUBLISHED",
  "DEAD_LETTER",
]);

export const idColumn = () => uuid("id").primaryKey();
export const tenantIdColumn = () => uuid("tenant_id").notNull();
export const timestampColumn = (name: string) =>
  timestamp(name, { mode: "date", withTimezone: true });
export const createdAtColumn = () => timestampColumn("created_at").notNull().defaultNow();
export const updatedAtColumn = () => timestampColumn("updated_at").notNull().defaultNow();
export const versionColumn = () => integer("version").notNull().default(1);

export function moneyColumns(prefix: string) {
  return {
    [`${prefix}AmountMinor`]: numeric(`${prefix}_amount_minor`, {
      mode: "string",
      precision: 38,
      scale: 0,
    }).notNull(),
    [`${prefix}Currency`]: text(`${prefix}_currency`).notNull(),
    [`${prefix}Scale`]: smallint(`${prefix}_scale`).notNull(),
    [`${prefix}Issuer`]: text(`${prefix}_issuer`),
  };
}

export const safeJsonColumn = (name: string) => jsonb(name).notNull().default(sql`'{}'::jsonb`);
