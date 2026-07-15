import { randomBytes } from "node:crypto";
import { resolve } from "node:path";

import { and, eq } from "drizzle-orm";
import type { TransactionSql } from "postgres";
import { v7 as uuidv7 } from "uuid";

import { authorize, AuthorizationError } from "../src/auth/authorization.js";
import {
  findActiveMembership,
  findActiveResourceAssignments,
} from "../src/auth/membership-repository.js";
import { actorRoles, humanActorRoles, type ActorRole } from "../src/auth/types.js";
import { loadConfig } from "../src/config/env.js";
import type { TransactionActorContext } from "../src/db/context.js";
import {
  createDatabase,
  createMigrationClient,
  resolveMigrationDatabaseUrl,
  type DatabaseHandle,
} from "../src/db/client.js";
import {
  auditEvents,
  idempotencyRecords,
  operations,
  outboxEvents,
} from "../src/db/schema/index.js";
import {
  IdempotencyConflictError,
  MutationCoordinator,
  type MutationScope,
} from "../src/reliability/mutation-coordinator.js";
import { claimOutboxBatch } from "../src/reliability/outbox.js";
import {
  PostgresMutationUnitOfWork,
  type PostgresMutationTransaction,
} from "../src/reliability/postgres-mutation-unit.js";
import { assertDedicatedTestProject } from "./migration-guard.js";

try {
  process.loadEnvFile(resolve(process.cwd(), "../../.env"));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`BE-03/BE-04 Supabase acceptance failed: ${message}`);
}

const config = loadConfig();
assertDedicatedTestProject(config);
const configuredUrl = config.databaseDirectUrl ?? config.databaseUrl;
if (configuredUrl === undefined) throw new Error("A database URL is required.");
const migrationUrl = resolveMigrationDatabaseUrl(configuredUrl, config.supabaseUrl);
const admin = createMigrationClient(migrationUrl);
const tenantA = uuidv7();
const tenantB = uuidv7();
const actor = uuidv7();
const suspendedActor = uuidv7();
const membershipA = uuidv7();
const membershipB = uuidv7();
const suspendedMembership = uuidv7();
const claimA = uuidv7();
const claimB = uuidv7();
const roleGrantIds = new Map<ActorRole, string>();
const now = new Date();

let api: DatabaseHandle | undefined;
let worker: DatabaseHandle | undefined;
try {
  await seedAuthorizationFixtures();
  api = await openRuntime("jejak_api");
  worker = await openRuntime("jejak_worker");

  await verifyAuthorizationMatrix(api);
  await verifyReliability(api, worker);

  console.log(
    "BE-03/BE-04 Supabase acceptance passed: canonical roles, multi-tenant membership, resource authorization, runtime RLS, atomic idempotency/audit/outbox, SKIP LOCKED, lease recovery.",
  );
} finally {
  await api?.close().catch(() => undefined);
  await worker?.close().catch(() => undefined);
  await disableRuntimeLogin("jejak_api");
  await disableRuntimeLogin("jejak_worker");
  await admin.close();
}

async function seedAuthorizationFixtures(): Promise<void> {
  await admin.sql`
    insert into jejak.organizations (id, name, slug, organization_type, seller_subject_salt_ref)
    values
      (${tenantA}, 'BE03 Tenant A', ${`be03-a-${tenantA}`}, 'TEST', ${`test:${tenantA}`}),
      (${tenantB}, 'BE03 Tenant B', ${`be03-b-${tenantB}`}, 'TEST', ${`test:${tenantB}`})
  `;
  await admin.sql`
    insert into jejak.user_profiles (id, auth_subject, status)
    values
      (${actor}, ${actor}, 'ACTIVE'),
      (${suspendedActor}, ${suspendedActor}, 'ACTIVE')
  `;
  await admin.sql`
    insert into jejak.organization_memberships
      (id, tenant_id, user_profile_id, status, activated_at)
    values
      (${membershipA}, ${tenantA}, ${actor}, 'ACTIVE', ${now}),
      (${membershipB}, ${tenantB}, ${actor}, 'ACTIVE', ${now}),
      (${suspendedMembership}, ${tenantA}, ${suspendedActor}, 'SUSPENDED', ${now})
  `;

  for (const role of humanActorRoles) {
    const id = uuidv7();
    roleGrantIds.set(role, id);
    await admin.sql`
      insert into jejak.membership_role_grants
        (id, tenant_id, membership_id, role, reason, status, valid_from)
      values (${id}, ${tenantA}, ${membershipA}, ${role}, 'BE03 acceptance', 'ACTIVE', ${now})
    `;
  }
  const tenantBGrant = uuidv7();
  await admin.sql`
    insert into jejak.membership_role_grants
      (id, tenant_id, membership_id, role, reason, status, valid_from)
    values (${tenantBGrant}, ${tenantB}, ${membershipB}, 'SELLER', 'BE03 multi-tenant', 'ACTIVE', ${now})
  `;
  await admin.sql`
    insert into jejak.membership_role_grants
      (id, tenant_id, membership_id, role, reason, status, valid_from)
    values (${uuidv7()}, ${tenantA}, ${suspendedMembership}, 'SELLER', 'BE03 suspended', 'ACTIVE', ${now})
  `;
  await admin.sql`
    insert into jejak.workload_identities (id, tenant_id, name, role, status)
    values
      (${uuidv7()}, ${tenantA}, 'be03-oracle', 'ORACLE', 'ACTIVE'),
      (${uuidv7()}, ${tenantA}, 'be03-system', 'SYSTEM', 'ACTIVE'),
      (${uuidv7()}, ${tenantB}, 'be03-other-system', 'SYSTEM', 'ACTIVE')
  `;
  await admin.sql`
    insert into jejak.resource_assignments
      (id, tenant_id, membership_id, resource_type, resource_id, capability, status)
    values
      (${uuidv7()}, ${tenantA}, ${membershipA}, 'CLAIM', ${claimA}, 'MANAGE', 'ACTIVE'),
      (${uuidv7()}, ${tenantA}, ${membershipA}, 'CLAIM', ${claimB}, 'MANAGE', 'SUSPENDED'),
      (${uuidv7()}, ${tenantB}, ${membershipB}, 'CLAIM', ${uuidv7()}, 'MANAGE', 'ACTIVE')
  `;
}

async function verifyAuthorizationMatrix(runtime: DatabaseHandle): Promise<void> {
  const activeA = await findActiveMembership(runtime.db, {
    authSubject: actor,
    requestId: uuidv7(),
    tenantId: tenantA,
  });
  assert(activeA !== undefined, "tenant A active membership must resolve");
  assert(
    humanActorRoles.every((role) => activeA.grants.some((grant) => grant.role === role)),
    "every canonical human role must resolve from active grants",
  );

  const activeB = await findActiveMembership(runtime.db, {
    authSubject: actor,
    requestId: uuidv7(),
    tenantId: tenantB,
  });
  assert(activeB?.membershipId === membershipB, "one actor must resolve a second active tenant");
  assert(activeB.grants.length === 1 && activeB.grants[0]?.role === "SELLER", "tenant grants must not bleed across tenants");

  const suspended = await findActiveMembership(runtime.db, {
    authSubject: suspendedActor,
    requestId: uuidv7(),
    tenantId: tenantA,
  });
  assert(suspended === undefined, "suspended membership must not resolve");

  const futureRoleId = uuidv7();
  await admin.sql`
    insert into jejak.membership_role_grants
      (id, tenant_id, membership_id, role, reason, status, valid_from)
    values (
      ${futureRoleId}, ${tenantB}, ${membershipB}, 'ADMIN', 'BE03 future grant', 'ACTIVE',
      ${new Date(Date.now() + 60_000)}
    )
  `;
  const beforeValidFrom = await findActiveMembership(runtime.db, {
    authSubject: actor,
    requestId: uuidv7(),
    tenantId: tenantB,
  });
  assert(
    beforeValidFrom?.grants.every((grant) => grant.grantId !== futureRoleId),
    "future role grants must not authorize early",
  );

  const assignmentRows = await findActiveResourceAssignments(runtime.db, {
    actorId: actor,
    membershipId: membershipA,
    requestId: uuidv7(),
    tenantId: tenantA,
  });
  assert(
    assignmentRows.length === 1 && assignmentRows[0]?.resourceId === claimA,
    "only the active tenant-bound resource assignment must resolve",
  );
  const grants = activeA.grants;
  let membershipOnlyRejected = false;
  try {
    authorize({
      actorId: actor,
      assignments: assignmentRows,
      grants,
      membershipId: activeA.membershipId,
      requiredRoles: ["ORIGINATOR"],
      resource: { capability: "MANAGE", resourceId: claimB, resourceType: "CLAIM" },
      tenantId: tenantA,
    });
  } catch (error) {
    membershipOnlyRejected = error instanceof AuthorizationError;
  }
  assert(membershipOnlyRejected, "membership without an exact resource assignment must be rejected");

  const machineRoles = await runtime.sql.begin(async (transaction) => {
    await setRuntimeContext(transaction, tenantA, actor);
    return transaction<{ role: ActorRole }[]>`
      select role from jejak.workload_identities where status = 'ACTIVE' order by role
    `;
  });
  assert(
    machineRoles.length === 2 &&
      machineRoles.some((row) => row.role === "ORACLE") &&
      machineRoles.some((row) => row.role === "SYSTEM"),
    "ORACLE and SYSTEM must resolve only as workload identities",
  );
  assert(
    new Set<ActorRole>([...activeA.grants.map((grant) => grant.role), ...machineRoles.map((row) => row.role)]).size === actorRoles.length,
    "the database acceptance matrix must cover all canonical actor roles",
  );

  const tenantBVisible = await runtime.sql.begin(async (transaction) => {
    await setRuntimeContext(transaction, tenantA, actor);
    return transaction<{ tenant_id: string }[]>`
      select tenant_id from jejak.workload_identities order by tenant_id
    `;
  });
  assert(
    tenantBVisible.every((row) => row.tenant_id === tenantA),
    "runtime RLS must hide tenant B workload identities",
  );
}

async function verifyReliability(apiRuntime: DatabaseHandle, workerRuntime: DatabaseHandle): Promise<void> {
  const aggregateId = uuidv7();
  const operationId = uuidv7();
  const scope: MutationScope = {
    actorId: actor,
    idempotencyKey: "be04-concurrent",
    operationId: "be04ConcurrentMutation",
    requestId: uuidv7(),
    tenantId: tenantA,
  };
  const roleGrantId = roleGrantIds.get("ADMIN");
  assert(roleGrantId !== undefined, "the ADMIN role grant must be seeded");
  const context: TransactionActorContext = {
    actorId: actor,
    membershipId: membershipA,
    requestId: scope.requestId,
    roleGrantId,
    tenantId: tenantA,
  };
  const execute = () => {
    const unit = new PostgresMutationUnitOfWork<{ id: string }>(apiRuntime.db, context);
    return mutationCoordinator(unit).execute({
      audit: {
        action: "be04.concurrent.completed",
        authorization: "Bearer acceptance-secret",
        resourceId: aggregateId,
        resourceType: "OPERATION",
        signedUrl: "https://private.example.test/object?token=acceptance-secret",
      },
      event: {
        aggregateId,
        aggregateType: "OPERATION",
        aggregateVersion: 1,
        eventType: "be04.concurrent.completed",
        payload: {
          aggregateId,
          email: "private@example.test",
          signedUrl: "https://private.example.test/object?token=acceptance-secret",
        },
      },
      mutate: async (transaction) => {
        await transaction.database.insert(operations).values({
          id: operationId,
          tenantId: tenantA,
          kind: "BE04_ACCEPTANCE",
          status: "COMPLETED",
          context: { safe: true },
        });
        return { id: operationId };
      },
      payload: { amountMinor: "64000000", currency: "USDC", scale: 6 },
      scope,
    });
  };

  const duplicateResults = await Promise.all([execute(), execute()]);
  assert(
    duplicateResults.every((result) => result.id === operationId),
    "concurrent duplicates must return the same durable response",
  );

  const conflictUnit = new PostgresMutationUnitOfWork<{ id: string }>(apiRuntime.db, context);
  let conflictRejected = false;
  try {
    await mutationCoordinator(conflictUnit).execute({
      audit: { action: "be04.concurrent.completed" },
      event: {
        aggregateId,
        aggregateType: "OPERATION",
        aggregateVersion: 1,
        eventType: "be04.concurrent.completed",
        payload: { aggregateId },
      },
      mutate: async () => ({ id: uuidv7() }),
      payload: { amountMinor: "65000000", currency: "USDC", scale: 6 },
      scope,
    });
  } catch (error) {
    conflictRejected = error instanceof IdempotencyConflictError;
  }
  assert(conflictRejected, "same idempotency scope with a different payload must conflict");

  const counts = await admin.sql<{
    audit_count: number;
    idempotency_count: number;
    operation_count: number;
    outbox_count: number;
  }[]>`
    select
      (select count(*)::int from jejak.operations where id = ${operationId}) as operation_count,
      (select count(*)::int from jejak.idempotency_records where tenant_id = ${tenantA} and idempotency_key = ${scope.idempotencyKey}) as idempotency_count,
      (select count(*)::int from jejak.audit_events where tenant_id = ${tenantA} and idempotency_key = ${scope.idempotencyKey}) as audit_count,
      (select count(*)::int from jejak.outbox_events where tenant_id = ${tenantA} and idempotency_key = ${scope.idempotencyKey}) as outbox_count
  `;
  assert(
    counts[0]?.operation_count === 1 &&
      counts[0].idempotency_count === 1 &&
      counts[0].audit_count === 1 &&
      counts[0].outbox_count === 1,
    "aggregate, idempotency, audit, and outbox must be committed exactly once",
  );

  const safeRecords = await admin.sql<{ payload: unknown; references: unknown }[]>`
    select audit.references, outbox.payload
    from jejak.audit_events audit
    join jejak.outbox_events outbox
      on outbox.tenant_id = audit.tenant_id and outbox.idempotency_key = audit.idempotency_key
    where audit.tenant_id = ${tenantA} and audit.idempotency_key = ${scope.idempotencyKey}
  `;
  const serializedSafeRecords = JSON.stringify(safeRecords);
  assert(!serializedSafeRecords.includes("acceptance-secret"), "audit/outbox must redact tokens and signed URLs");
  assert(!serializedSafeRecords.includes("private@example.test"), "audit/outbox must redact email");

  const rollbackOperationId = uuidv7();
  const rollbackScope = { ...scope, idempotencyKey: "be04-rollback", requestId: uuidv7() };
  const rollbackContext = { ...context, requestId: rollbackScope.requestId };
  const rollbackUnit = new PostgresMutationUnitOfWork<{ id: string }>(apiRuntime.db, rollbackContext);
  let injectedFailureObserved = false;
  try {
    await mutationCoordinator(rollbackUnit).execute({
      audit: { action: "be04.rollback" },
      event: {
        aggregateId: rollbackOperationId,
        aggregateType: "OPERATION",
        aggregateVersion: 1,
        eventType: "be04.rollback",
        payload: {},
      },
      mutate: async (transaction) => {
        await transaction.database.insert(operations).values({
          id: rollbackOperationId,
          tenantId: tenantA,
          kind: "BE04_ROLLBACK",
          status: "STARTED",
        });
        throw new Error("injected acceptance rollback");
      },
      payload: {},
      scope: rollbackScope,
    });
  } catch (error) {
    injectedFailureObserved = error instanceof Error && error.message === "injected acceptance rollback";
  }
  assert(injectedFailureObserved, "the injected transaction failure must be observed");
  const rollbackCounts = await admin.sql<{ count: number }[]>`
    select (
      (select count(*) from jejak.operations where id = ${rollbackOperationId}) +
      (select count(*) from jejak.idempotency_records where tenant_id = ${tenantA} and idempotency_key = ${rollbackScope.idempotencyKey}) +
      (select count(*) from jejak.audit_events where tenant_id = ${tenantA} and idempotency_key = ${rollbackScope.idempotencyKey}) +
      (select count(*) from jejak.outbox_events where tenant_id = ${tenantA} and idempotency_key = ${rollbackScope.idempotencyKey})
    )::int as count
  `;
  assert(rollbackCounts[0]?.count === 0, "failed mutation must roll back aggregate/idempotency/audit/outbox");

  const secondAggregate = uuidv7();
  const secondOperation = uuidv7();
  const secondScope = { ...scope, idempotencyKey: "be04-second", requestId: uuidv7() };
  const secondContext = { ...context, requestId: secondScope.requestId };
  const secondUnit = new PostgresMutationUnitOfWork<{ id: string }>(apiRuntime.db, secondContext);
  await mutationCoordinator(secondUnit).execute({
    audit: { action: "be04.second" },
    event: {
      aggregateId: secondAggregate,
      aggregateType: "OPERATION",
      aggregateVersion: 1,
      eventType: "be04.second",
      payload: { aggregateId: secondAggregate },
    },
    mutate: async (transaction) => {
      await transaction.database.insert(operations).values({
        id: secondOperation,
        tenantId: tenantA,
        kind: "BE04_ACCEPTANCE",
        status: "COMPLETED",
      });
      return { id: secondOperation };
    },
    payload: { aggregateId: secondAggregate },
    scope: secondScope,
  });

  const [workerOne, workerTwo] = await Promise.all([
    claimOutboxBatch(workerRuntime.sql, {
      batchSize: 1,
      leaseMilliseconds: 60_000,
      tenantId: tenantA,
      workerId: "be04-worker-1",
    }),
    claimOutboxBatch(workerRuntime.sql, {
      batchSize: 1,
      leaseMilliseconds: 60_000,
      tenantId: tenantA,
      workerId: "be04-worker-2",
    }),
  ]);
  const claimedIds = [...workerOne, ...workerTwo].map((row) => (row as { id: string }).id);
  assert(claimedIds.length === 2 && new Set(claimedIds).size === 2, "SKIP LOCKED workers must claim distinct events");

  const expiredLeaseId = claimedIds[0];
  assert(expiredLeaseId !== undefined, "one claimed outbox event is required for lease recovery");
  await admin.sql`
    update jejak.outbox_events
    set leased_until = now() - interval '1 minute', next_attempt_at = now() - interval '1 minute'
    where id = ${expiredLeaseId}
  `;
  const recovered = await claimOutboxBatch(workerRuntime.sql, {
    batchSize: 1,
    leaseMilliseconds: 60_000,
    tenantId: tenantA,
    workerId: "be04-worker-recovery",
  });
  assert(
    (recovered[0] as { id?: string } | undefined)?.id === expiredLeaseId,
    "an expired lease must become claimable again",
  );

  let auditMutationRejected = false;
  try {
    await apiRuntime.sql.begin(async (transaction) => {
      await setRuntimeContext(transaction, tenantA, actor);
      await transaction`
        update jejak.audit_events set result = 'MUTATED'
        where tenant_id = ${tenantA} and idempotency_key = ${scope.idempotencyKey}
      `;
    });
  } catch (error) {
    auditMutationRejected = ["42501", "55000"].includes((error as { code?: string }).code ?? "");
  }
  assert(auditMutationRejected, "runtime role must not mutate append-only audit rows");

  const [storedIdempotency] = await admin.db
    .select({ responseBody: idempotencyRecords.responseBody })
    .from(idempotencyRecords)
    .where(
      and(
        eq(idempotencyRecords.tenantId, tenantA),
        eq(idempotencyRecords.idempotencyKey, scope.idempotencyKey),
      ),
    )
    .limit(1);
  assert(
    (storedIdempotency?.responseBody as { id?: string } | null)?.id === operationId,
    "the replay response must be durably stored",
  );

  const tenantAOutbox = await admin.db
    .select({ id: outboxEvents.id })
    .from(outboxEvents)
    .where(eq(outboxEvents.tenantId, tenantA));
  const tenantAAudit = await admin.db
    .select({ id: auditEvents.id })
    .from(auditEvents)
    .where(eq(auditEvents.tenantId, tenantA));
  assert(tenantAOutbox.length === 2 && tenantAAudit.length === 2, "safe replay/conflict must not duplicate audit or outbox");
}

async function setRuntimeContext(
  transaction: TransactionSql,
  tenantId: string,
  actorId: string,
): Promise<void> {
  await transaction`select set_config('jejak.tenant_id', ${tenantId}, true)`;
  await transaction`select set_config('jejak.actor_id', ${actorId}, true)`;
  await transaction`select set_config('jejak.request_id', ${uuidv7()}, true)`;
}

function mutationCoordinator(
  unit: PostgresMutationUnitOfWork<{ id: string }>,
): MutationCoordinator<{ id: string }, PostgresMutationTransaction<{ id: string }>> {
  return new MutationCoordinator<
    { id: string },
    PostgresMutationTransaction<{ id: string }>
  >(unit);
}

async function openRuntime(role: "jejak_api" | "jejak_worker"): Promise<DatabaseHandle> {
  const password = randomBytes(32).toString("hex");
  const validUntil = new Date(Date.now() + 10 * 60_000).toISOString();
  await admin.sql.unsafe(`alter role ${role} login password '${password}' valid until '${validUntil}'`);
  const runtimeUrl = new URL(migrationUrl);
  runtimeUrl.username = role;
  runtimeUrl.password = password;
  return createDatabase(runtimeUrl.toString());
}

async function disableRuntimeLogin(role: "jejak_api" | "jejak_worker"): Promise<void> {
  try {
    await admin.sql.unsafe(`alter role ${role} nologin password null`);
  } catch {
    // The guarded runner restores the entire dedicated test project even if cleanup reaches this fallback.
  }
}
