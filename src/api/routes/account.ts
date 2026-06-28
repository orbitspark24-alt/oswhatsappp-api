import { FastifyInstance } from "fastify";
import { authenticate, requireScope } from "../auth";
import { AccountService } from "../../services/AccountService";
import { UsageService } from "../../services/UsageService";

// /api/v1/accounts & /api/v1/usage — the client's own WhatsApp accounts and quota usage.
// Secrets are never returned.
export function registerAccountRoutes(app: FastifyInstance): void {
  app.get(
    "/api/v1/accounts",
    {
      preHandler: [authenticate, requireScope("accounts:read")],
      schema: { tags: ["accounts"], summary: "List your WhatsApp accounts", security: [{ apiKey: [] }] },
    },
    async (req, reply) => {
      const accounts = await AccountService.list({ clientId: req.auth!.clientId });
      reply.send({
        data: accounts.map((a) => ({
          id: a.id,
          provider: a.provider,
          phoneNumberId: a.phoneNumberId,
          displayPhoneNumber: a.displayPhoneNumber,
          status: a.status,
          healthStatus: a.healthStatus,
        })),
      });
    }
  );

  app.get(
    "/api/v1/usage",
    {
      preHandler: [authenticate, requireScope("usage:read")],
      schema: {
        tags: ["accounts"],
        summary: "Quota/usage for an account's current cycle",
        security: [{ apiKey: [] }],
        querystring: { type: "object", required: ["accountId"], properties: { accountId: { type: "string" } } },
      },
    },
    async (req, reply) => {
      const q = req.query as { accountId: string };
      const account = await AccountService.getById(q.accountId);
      if (account.clientId !== req.auth!.clientId) {
        return reply.code(403).send({ error: "forbidden" });
      }
      reply.send(await UsageService.getQuotaStatus(q.accountId));
    }
  );
}
