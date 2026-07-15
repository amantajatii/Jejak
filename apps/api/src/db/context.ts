import { sql } from "drizzle-orm";

import type { JejakDatabase } from "./client.js";

export type TransactionActorContext = {
  actorId: string;
  membershipId?: string;
  requestId: string;
  roleGrantId?: string;
  tenantId: string;
};

type TransactionExecutor = Pick<JejakDatabase, "execute">;

export async function applyTransactionContext(
  transaction: TransactionExecutor,
  context: TransactionActorContext,
): Promise<void> {
  await transaction.execute(sql`
    select
      set_config('jejak.tenant_id', ${context.tenantId}, true),
      set_config('jejak.actor_id', ${context.actorId}, true),
      set_config('jejak.membership_id', ${context.membershipId ?? ""}, true),
      set_config('jejak.role_grant_id', ${context.roleGrantId ?? ""}, true),
      set_config('jejak.request_id', ${context.requestId}, true)
  `);
}

export async function withTenantTransaction<T>(
  database: JejakDatabase,
  context: TransactionActorContext,
  work: (transaction: JejakDatabase) => Promise<T>,
): Promise<T> {
  return database.transaction(async (transaction) => {
    await applyTransactionContext(transaction, context);
    return work(transaction as JejakDatabase);
  });
}
