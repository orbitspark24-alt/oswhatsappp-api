import { FastifyInstance } from "fastify";
import { authenticate, requireScope } from "../auth";
import { WebhookEndpointService } from "../../services/WebhookEndpointService";

// /api/v1/webhooks — the CRM registers a callback URL here to receive inbound message and
// status events. The platform signs outbound payloads with the returned secret (delivery in step 7).
export function registerWebhookEndpointRoutes(app: FastifyInstance): void {
  app.get(
    "/api/v1/webhooks",
    {
      preHandler: [authenticate, requireScope("webhooks:read")],
      schema: { tags: ["webhook-endpoints"], summary: "List your registered callback URLs", security: [{ apiKey: [] }] },
    },
    async (req, reply) => {
      const endpoints = await WebhookEndpointService.list(req.auth!.clientId);
      // Do not echo the signing secret on list.
      reply.send({ data: endpoints.map(({ secret, ...rest }) => rest) });
    }
  );

  app.post(
    "/api/v1/webhooks",
    {
      preHandler: [authenticate, requireScope("webhooks:write")],
      schema: {
        tags: ["webhook-endpoints"],
        summary: "Register a CRM callback URL",
        security: [{ apiKey: [] }],
        body: {
          type: "object",
          required: ["url"],
          properties: {
            url: { type: "string", format: "uri" },
            events: { type: "array", items: { type: "string" } },
          },
        },
      },
    },
    async (req, reply) => {
      const body = req.body as { url: string; events?: string[] };
      const endpoint = await WebhookEndpointService.register({
        clientId: req.auth!.clientId,
        url: body.url,
        events: body.events ?? ["*"],
      });
      // Return the signing secret once so the CRM can verify future payloads.
      reply.code(201).send(endpoint);
    }
  );
}
