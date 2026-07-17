import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

import type { AuthorizationContext } from "../../auth/types.js";
import { successEnvelope } from "../../lib/envelopes.js";
import {
  authorizeAssignedClaimCommand,
  type ClaimCommandAuthorizationDependencies,
} from "../control/routes.js";
import type { PersistedJcc } from "./ports/index.js";

const uuidV7 = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
const params = z.object({ id: uuidV7 }).strict();
const issueBody = z.object({
  attestationId: uuidV7,
  evaluationId: uuidV7,
  expiresAt: z.iso.datetime({ offset: true }),
}).strict();

export type JccIssueCommand = {
  attestationId: string;
  claimId: string;
  evaluationId: string;
  expiresAt: string;
  issuedAt: string;
};

export type JccCommandContext = AuthorizationContext & { requestId: string };

export type JccRouteDependencies = ClaimCommandAuthorizationDependencies & {
  issue(context: JccCommandContext, command: JccIssueCommand): Promise<PersistedJcc>;
  sandbox: boolean;
};

function toResponse(persisted: PersistedJcc) {
  return {
    attestation: persisted.envelope.attestation,
    envelopeHash: persisted.envelope.envelopeHash,
    payloadHash: persisted.envelope.payloadHash,
    status: persisted.operationalStatus,
    version: persisted.version,
  };
}

/** Registers the ORACLE-only JCC registration endpoint (sign + register on-chain). */
export async function registerJccRoutes(app: FastifyInstance, dependencies: JccRouteDependencies): Promise<void> {
  app.post("/v1/claims/:id/jcc", async (request: FastifyRequest, reply) => {
    const { id: claimId } = params.parse(request.params);
    const body = issueBody.parse(request.body);
    const authorization = await authorizeAssignedClaimCommand(request, dependencies, claimId, ["ORACLE"]);
    const persisted = await dependencies.issue(
      { ...authorization, requestId: request.id },
      {
        attestationId: body.attestationId,
        claimId,
        evaluationId: body.evaluationId,
        expiresAt: body.expiresAt,
        issuedAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
      },
    );
    reply.header("X-Request-Id", request.id).header("X-Jejak-Sandbox", String(dependencies.sandbox));
    return reply.code(201).send(successEnvelope(toResponse(persisted), { requestId: request.id, sandbox: dependencies.sandbox }));
  });
}
