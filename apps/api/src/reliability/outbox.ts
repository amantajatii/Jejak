import type { Sql } from "postgres";

export function retryDelayMilliseconds(attempt: number, random = Math.random): number {
  const capped = Math.min(Math.max(attempt, 0), 10);
  const base = Math.min(60_000, 500 * 2 ** capped);
  return Math.floor(base * (0.5 + random()));
}

export async function claimOutboxBatch(
  sql: Sql,
  input: { batchSize: number; leaseMilliseconds: number; tenantId: string; workerId: string },
): Promise<unknown[]> {
  return sql.begin(async (transaction) => {
    await transaction`select set_config('jejak.tenant_id', ${input.tenantId}, true)`;
    const rows = await transaction`
      with candidates as (
        select id
        from jejak.outbox_events
        where tenant_id = ${input.tenantId}
          and status in ('PENDING', 'PROCESSING')
          and next_attempt_at <= now()
          and (leased_until is null or leased_until < now())
        order by created_at
        for update skip locked
        limit ${input.batchSize}
      )
      update jejak.outbox_events event
      set status = 'PROCESSING',
          lease_owner = ${input.workerId},
          leased_until = now() + (${input.leaseMilliseconds} * interval '1 millisecond'),
          attempt_count = event.attempt_count + 1
      from candidates
      where event.id = candidates.id and event.tenant_id = ${input.tenantId}
      returning event.*
    `;
    return [...rows];
  });
}
