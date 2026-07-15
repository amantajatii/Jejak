import { and, desc, eq, inArray, lt, or } from "drizzle-orm";
import { z } from "zod";

import type { JejakDatabase } from "../../../db/client.js";
import { withTenantTransaction, type TransactionActorContext } from "../../../db/context.js";
import { claims, financingOffers, sellers } from "../../../db/schema/domain.js";
import { validationError } from "../../shared/errors.js";
import type { LifecycleClaim } from "../domain/lifecycle.js";
import type { LifecycleOffer } from "../domain/offers.js";

const cursorSchema = z.object({
  createdAt: z.iso.datetime({ offset: true }),
  id: z.uuid(),
}).strict();

export type ClaimVisibility =
  | { kind: "ALL" }
  | { authSubject: string; kind: "SELLER_OWNED" }
  | { claimIds: string[]; kind: "ASSIGNED" };

export type ClaimPage = {
  items: LifecycleClaim[];
  nextCursor?: string;
};

function decodeCursor(value: string): z.infer<typeof cursorSchema> {
  try {
    return cursorSchema.parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
  } catch {
    validationError("Claim cursor is invalid.");
  }
}

function encodeCursor(row: { createdAt: Date; id: string }): string {
  return Buffer.from(
    JSON.stringify({ createdAt: row.createdAt.toISOString(), id: row.id }),
    "utf8",
  ).toString("base64url");
}

export class PostgresClaimQueryRepository {
  constructor(private readonly database: JejakDatabase) {}

  async findClaim(
    context: TransactionActorContext,
    claimId: string,
  ): Promise<LifecycleClaim | null> {
    return withTenantTransaction(this.database, context, async (transaction) => {
      const [row] = await transaction
        .select({ canonicalPayload: claims.canonicalPayload })
        .from(claims)
        .where(and(eq(claims.tenantId, context.tenantId), eq(claims.id, claimId)))
        .limit(1);
      return (row?.canonicalPayload as LifecycleClaim | undefined) ?? null;
    });
  }

  async findSellerOwnedClaim(
    context: TransactionActorContext,
    authSubject: string,
    claimId: string,
  ): Promise<LifecycleClaim | null> {
    return withTenantTransaction(this.database, context, async (transaction) => {
      const [row] = await transaction
        .select({ canonicalPayload: claims.canonicalPayload })
        .from(claims)
        .innerJoin(sellers, and(eq(sellers.tenantId, claims.tenantId), eq(sellers.id, claims.sellerId)))
        .where(
          and(
            eq(claims.tenantId, context.tenantId),
            eq(claims.id, claimId),
            eq(sellers.sellerSubject, authSubject),
            eq(sellers.status, "ACTIVE"),
          ),
        )
        .limit(1);
      return (row?.canonicalPayload as LifecycleClaim | undefined) ?? null;
    });
  }

  async findSellerOwnedOffer(
    context: TransactionActorContext,
    authSubject: string,
    offerId: string,
  ): Promise<LifecycleOffer | null> {
    return withTenantTransaction(this.database, context, async (transaction) => {
      const [row] = await transaction
        .select({ canonicalPayload: financingOffers.canonicalPayload })
        .from(financingOffers)
        .innerJoin(
          claims,
          and(eq(claims.tenantId, financingOffers.tenantId), eq(claims.id, financingOffers.claimId)),
        )
        .innerJoin(sellers, and(eq(sellers.tenantId, claims.tenantId), eq(sellers.id, claims.sellerId)))
        .where(
          and(
            eq(financingOffers.tenantId, context.tenantId),
            eq(financingOffers.id, offerId),
            eq(sellers.sellerSubject, authSubject),
            eq(sellers.status, "ACTIVE"),
          ),
        )
        .limit(1);
      return (row?.canonicalPayload as LifecycleOffer | undefined) ?? null;
    });
  }

  async hasActiveOffer(
    context: TransactionActorContext,
    claimId: string,
  ): Promise<boolean> {
    return withTenantTransaction(this.database, context, async (transaction) => {
      const [row] = await transaction
        .select({ id: financingOffers.id })
        .from(financingOffers)
        .where(
          and(
            eq(financingOffers.tenantId, context.tenantId),
            eq(financingOffers.claimId, claimId),
            inArray(financingOffers.status, ["OFFERED", "ACCEPTED"]),
          ),
        )
        .limit(1);
      return row !== undefined;
    });
  }

  async listClaims(
    context: TransactionActorContext,
    input: {
      cursor?: string;
      limit: number;
      state?: string;
      visibility: ClaimVisibility;
    },
  ): Promise<ClaimPage> {
    if (input.visibility.kind === "ASSIGNED" && input.visibility.claimIds.length === 0) {
      return { items: [] };
    }
    const cursor = input.cursor === undefined ? undefined : decodeCursor(input.cursor);
    return withTenantTransaction(this.database, context, async (transaction) => {
      const visibility = input.visibility;
      const filters = [eq(claims.tenantId, context.tenantId)];
      if (input.state !== undefined) filters.push(eq(claims.state, input.state));
      if (cursor !== undefined) {
        const createdAt = new Date(cursor.createdAt);
        filters.push(
          or(
            lt(claims.createdAt, createdAt),
            and(eq(claims.createdAt, createdAt), lt(claims.id, cursor.id)),
          )!,
        );
      }
      if (visibility.kind === "ASSIGNED") {
        filters.push(inArray(claims.id, visibility.claimIds));
      }

      const columns = {
        canonicalPayload: claims.canonicalPayload,
        createdAt: claims.createdAt,
        id: claims.id,
      };
      const rows = visibility.kind === "SELLER_OWNED"
        ? await transaction
            .select(columns)
            .from(claims)
            .innerJoin(
              sellers,
              and(eq(sellers.tenantId, claims.tenantId), eq(sellers.id, claims.sellerId)),
            )
            .where(
              and(
                ...filters,
                eq(sellers.sellerSubject, visibility.authSubject),
                eq(sellers.status, "ACTIVE"),
              ),
            )
            .orderBy(desc(claims.createdAt), desc(claims.id))
            .limit(input.limit + 1)
        : await transaction
            .select(columns)
            .from(claims)
            .where(and(...filters))
            .orderBy(desc(claims.createdAt), desc(claims.id))
            .limit(input.limit + 1);

      const hasNext = rows.length > input.limit;
      const page = rows.slice(0, input.limit);
      const last = page.at(-1);
      return {
        items: page.map((row) => row.canonicalPayload as LifecycleClaim),
        ...(hasNext && last !== undefined ? { nextCursor: encodeCursor(last) } : {}),
      };
    });
  }
}
