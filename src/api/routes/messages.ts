import { FastifyInstance } from "fastify";
import { authenticate, requireScope, assertAccountOwned } from "../auth";
import { MessageService } from "../../services/MessageService";

// /api/v1/messages — send messages and read the conversation log, scoped to the API key's client.
export function registerMessageRoutes(app: FastifyInstance): void {
  app.post(
    "/api/v1/messages",
    {
      preHandler: [authenticate, requireScope("messages:write")],
      schema: {
        tags: ["messages"],
        summary: "Send a WhatsApp message",
        security: [{ apiKey: [] }],
        body: {
          type: "object",
          required: ["accountId", "to", "type", "content"],
          properties: {
            accountId: { type: "string" },
            to: { type: "string", description: "Recipient E.164 without +" },
            type: {
              type: "string",
              enum: ["text", "image", "video", "document", "audio", "location", "contacts", "interactive", "template"],
            },
            content: { type: "object", additionalProperties: true },
          },
        },
      },
    },
    async (req, reply) => {
      const body = req.body as { accountId: string; to: string; type: string; content: Record<string, unknown> };
      await assertAccountOwned(body.accountId, req.auth!.clientId);
      const msg = await MessageService.send(body.accountId, {
        to: body.to,
        type: body.type as never,
        content: body.content,
      });
      reply.code(201).send({ id: msg.id, status: msg.status, waMessageId: msg.waMessageId });
    }
  );

  app.get(
    "/api/v1/messages",
    {
      preHandler: [authenticate, requireScope("messages:read")],
      schema: {
        tags: ["messages"],
        summary: "Fetch conversation log for an account",
        security: [{ apiKey: [] }],
        querystring: {
          type: "object",
          required: ["accountId"],
          properties: {
            accountId: { type: "string" },
            contact: { type: "string" },
            limit: { type: "integer", default: 50 },
          },
        },
      },
    },
    async (req, reply) => {
      const q = req.query as { accountId: string; contact?: string; limit?: number };
      await assertAccountOwned(q.accountId, req.auth!.clientId);
      const messages = await MessageService.list(q.accountId, { contact: q.contact, take: q.limit });
      reply.send({ data: messages });
    }
  );
}
