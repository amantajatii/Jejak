import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { parseTenantId } from "../../auth/tenant.js";
import { actorRoles, type ActorRole } from "../../auth/types.js";
import { successEnvelope } from "../../lib/envelopes.js";
import type { DemoSessionCredential } from "./identity.js";
import type { DemoContext } from "./reset-service.js";

const sessionBody = z.object({ role: z.enum(actorRoles) }).strict();
const resetBody = z.object({ scenario: z.enum(["HAPPY", "ADVERSE"]) }).strict();
const idempotencyKey = z.string().min(16).max(255);

export type DemoRouteDependencies = {
  getContext(tenantId: string): Promise<DemoContext>;
  reset(input: {
    idempotencyKey: string;
    requestId: string;
    scenario: "HAPPY" | "ADVERSE";
  }): Promise<DemoContext>;
  createSession(input: {
    idempotencyKey: string;
    requestId: string;
    role: ActorRole;
    tenantId: string;
  }): Promise<DemoSessionCredential>;
};

export async function registerDemoRoutes(app: FastifyInstance, dependencies: DemoRouteDependencies): Promise<void> {
  app.post("/v1/demo/reset", async (request, reply) => {
    const body = resetBody.parse(request.body);
    const context = await dependencies.reset({
      idempotencyKey: idempotencyKey.parse(request.headers["idempotency-key"]),
      requestId: request.id,
      scenario: body.scenario,
    });
    reply.header("X-Request-Id", request.id).header("X-Jejak-Sandbox", "true");
    return reply.code(200).send(successEnvelope(context, { requestId: request.id, sandbox: true }));
  });

  app.get("/v1/demo/context", async (request, reply) => {
    const context = await dependencies.getContext(parseTenantId(request.headers["x-jejak-tenant-id"]));
    reply.header("X-Request-Id", request.id).header("X-Jejak-Sandbox", "true");
    return reply.code(200).send(successEnvelope(context, { requestId: request.id, sandbox: true }));
  });

  app.post("/v1/demo/sessions", async (request, reply) => {
    const tenantId = parseTenantId(request.headers["x-jejak-tenant-id"]);
    const body = sessionBody.parse(request.body);
    const session = await dependencies.createSession({
      idempotencyKey: idempotencyKey.parse(request.headers["idempotency-key"]),
      requestId: request.id,
      role: body.role,
      tenantId,
    });
    reply.header("X-Request-Id", request.id).header("X-Jejak-Sandbox", "true");
    return reply.code(201).send(successEnvelope(session, { requestId: request.id, sandbox: true }));
  });
}
