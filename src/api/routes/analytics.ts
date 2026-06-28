import { FastifyInstance } from "fastify";
import { authenticate, requireScope, assertAccountOwned } from "../auth";
import { AnalyticsService } from "../../services/AnalyticsService";
import { BroadcastService, BroadcastRecipient } from "../../services/BroadcastService";
import { TemplateService } from "../../services/TemplateService";

// /api/v1/analytics and /api/v1/broadcasts — reporting + bulk sends, scoped to the API key's client.
export function registerAnalyticsRoutes(app: FastifyInstance): void {
  app.get(
    "/api/v1/analytics",
    {
      preHandler: [authenticate, requireScope("analytics:read")],
      schema: { tags: ["analytics"], summary: "Messaging/quota/cost analytics for your account(s)", security: [{ apiKey: [] }] },
    },
    async (req, reply) => {
      reply.send(await AnalyticsService.forClient(req.auth!.clientId));
    }
  );

  app.post(
    "/api/v1/broadcasts",
    {
      preHandler: [authenticate, requireScope("messages:write")],
      schema: {
        tags: ["analytics"],
        summary: "Rate-limited bulk template broadcast",
        security: [{ apiKey: [] }],
        body: {
          type: "object",
          required: ["templateId", "recipients"],
          properties: {
            templateId: { type: "string" },
            recipients: {
              type: "array",
              items: {
                type: "object",
                required: ["to"],
                properties: { to: { type: "string" }, variables: { type: "array", items: { type: "string" } } },
              },
            },
          },
        },
      },
    },
    async (req, reply) => {
      const body = req.body as { templateId: string; recipients: BroadcastRecipient[] };
      const template = await TemplateService.getById(body.templateId);
      await assertAccountOwned(template.whatsappAccountId, req.auth!.clientId);
      const summary = await BroadcastService.broadcastTemplate(body.templateId, body.recipients);
      reply.send(summary);
    }
  );
}
