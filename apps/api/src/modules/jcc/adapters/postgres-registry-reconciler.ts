import { and, eq } from "drizzle-orm";

import type { JejakDatabase } from "../../../db/client.js";
import { withTenantTransaction, type TransactionActorContext } from "../../../db/context.js";
import { chainEvents } from "../../../db/schema/chain.js";
import type { RegistryReconciler } from "../ports/index.js";

type RegisteredPayload = { attestationKey?: unknown; envelopeHash?: unknown };
type RevokedPayload = { attestationKey?: unknown; reasonCode?: unknown };

export class PostgresEligibilityRegistryReconciler implements RegistryReconciler {
  constructor(
    private readonly database: JejakDatabase,
    private readonly actorContext: TransactionActorContext,
    private readonly network: string,
  ) {}

  async reconcile(input: Parameters<RegistryReconciler["reconcile"]>[0]) {
    return withTenantTransaction(this.database, this.actorContext, async (database) => {
      const eventType = input.expectedStatus === "ACTIVE"
        ? "attestation.registered"
        : "attestation.revoked";
      const rows = await database
        .select({ safePayload: chainEvents.safePayload })
        .from(chainEvents)
        .where(
          and(
            eq(chainEvents.tenantId, this.actorContext.tenantId),
            eq(chainEvents.network, this.network),
            eq(chainEvents.contractName, "eligibility_registry"),
            eq(chainEvents.transactionHash, input.transactionHash),
            eq(chainEvents.eventType, eventType),
          ),
        );
      for (const row of rows) {
        if (input.expectedStatus === "ACTIVE") {
          const payload = row.safePayload as RegisteredPayload;
          if (
            payload.attestationKey === input.attestationKey &&
            payload.envelopeHash === input.envelopeHash
          ) {
            return {
              reconciled: true,
              record: {
                attestationKey: input.attestationKey,
                envelopeHash: input.envelopeHash,
                status: "ACTIVE" as const,
              },
            };
          }
        } else {
          const payload = row.safePayload as RevokedPayload;
          if (payload.attestationKey === input.attestationKey) {
            return {
              reconciled: true,
              record: {
                attestationKey: input.attestationKey,
                envelopeHash: input.envelopeHash,
                status: "REVOKED" as const,
              },
            };
          }
        }
      }
      return { reconciled: false };
    });
  }
}
