import { and, eq } from "drizzle-orm";

import type { JejakDatabase } from "../../../db/client.js";
import { applyTransactionContext } from "../../../db/context.js";
import { claims } from "../../../db/schema/index.js";
import { DomainError } from "../../shared/errors.js";
import type { SettlementClaimVersionGuard } from "../ports/settlement.js";

/** Tenant-scoped version read for the reconciliation command boundary. */
export class PostgresSettlementClaimVersionGuard implements SettlementClaimVersionGuard {
  constructor(private readonly database: JejakDatabase) {}

  async assertCurrent(input: Parameters<SettlementClaimVersionGuard["assertCurrent"]>[0]): Promise<void> {
    await this.database.transaction(async (transaction) => {
      const database = transaction as JejakDatabase;
      await applyTransactionContext(database, {
        actorId: input.context.actorId,
        requestId: input.context.requestId,
        tenantId: input.context.tenantId,
      });
      const [claim] = await database.select({ version: claims.version }).from(claims).where(and(
        eq(claims.tenantId, input.context.tenantId),
        eq(claims.id, input.claimId),
      )).limit(1);
      if (claim === undefined || claim.version !== input.expectedVersion) {
        throw new DomainError("VERSION_CONFLICT", "Claim version does not match If-Match.");
      }
    });
  }
}
