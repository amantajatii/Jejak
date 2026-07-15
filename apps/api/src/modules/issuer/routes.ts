import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

import { successEnvelope } from "../../lib/envelopes.js";
import type { IssuerApprovalReceipt, IssuerOperationContext } from "./domain/types.js";

const uuidV7 = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
const params = z.object({ id: uuidV7 }).strict();
const body = z.object({ attestationId: uuidV7, controlEvidenceId: uuidV7 }).strict();
const expectedVersion = z.coerce.number().int().min(1);

export type IssuerIssueRouteActor = {
  actorId: string;
  correlationId: string;
  idempotencyKey: string;
  requestId: string;
  requestedAt: string;
  tenantId: string;
};

export type IssuerIssueRouteDependencies = {
  /** Verifies selected tenant, ISSUER role, and CLAIM MANAGE assignment. */
  authorizeIssuer(request: FastifyRequest, claimId: string): Promise<IssuerIssueRouteActor>;
  /** Builds the issuer transaction from canonical claim/evidence records and configured sandbox boundary. */
  buildIssueContext(input: IssuerIssueRouteActor & {
    attestationId: string;
    claimId: string;
    controlEvidenceId: string;
    expectedClaimVersion: number;
  }): Promise<IssuerOperationContext>;
  execute(context: IssuerOperationContext): Promise<IssuerApprovalReceipt>;
};

/** Export-only frozen-contract registrar; Session 1 owns application composition. */
export async function registerIssuerIssueRoutes(app: FastifyInstance, dependencies: IssuerIssueRouteDependencies): Promise<void> {
  app.post("/v1/claims/:id/issue", async (request, reply) => {
    const { id: claimId } = params.parse(request.params);
    const command = body.parse(request.body);
    const actor = await dependencies.authorizeIssuer(request, claimId);
    const context = await dependencies.buildIssueContext({
      ...actor,
      attestationId: command.attestationId,
      claimId,
      controlEvidenceId: command.controlEvidenceId,
      expectedClaimVersion: expectedVersion.parse(request.headers["if-match"]),
    });
    if (context.aggregateId !== claimId || context.transaction.claimId !== claimId) {
      throw new Error("Issuer context did not reconcile with the frozen request.");
    }
    const receipt = await dependencies.execute(context);
    reply.header("X-Jejak-Sandbox", "true").header("X-Request-Id", request.id);
    return reply.code(202).send(successEnvelope(receipt, { requestId: request.id, sandbox: true }));
  });
}
