import { FastifyInstance } from "fastify";
import { authenticate, requireScope, assertAccountOwned } from "../auth";
import { TemplateService } from "../../services/TemplateService";

// /api/v1/templates — manage and send message templates, scoped to the API key's client.
export function registerTemplateRoutes(app: FastifyInstance): void {
  app.get(
    "/api/v1/templates",
    {
      preHandler: [authenticate, requireScope("templates:read")],
      schema: {
        tags: ["templates"],
        summary: "List templates for an account",
        security: [{ apiKey: [] }],
        querystring: { type: "object", required: ["accountId"], properties: { accountId: { type: "string" } } },
      },
    },
    async (req, reply) => {
      const q = req.query as { accountId: string };
      await assertAccountOwned(q.accountId, req.auth!.clientId);
      reply.send({ data: await TemplateService.list(q.accountId) });
    }
  );

  app.post(
    "/api/v1/templates",
    {
      preHandler: [authenticate, requireScope("templates:write")],
      schema: {
        tags: ["templates"],
        summary: "Create and submit a template to Meta",
        security: [{ apiKey: [] }],
        body: {
          type: "object",
          required: ["accountId", "name", "language", "category", "components"],
          properties: {
            accountId: { type: "string" },
            name: { type: "string" },
            language: { type: "string" },
            category: { type: "string", enum: ["MARKETING", "UTILITY", "AUTHENTICATION"] },
            components: { type: "array", items: { type: "object", additionalProperties: true } },
          },
        },
      },
    },
    async (req, reply) => {
      const body = req.body as {
        accountId: string; name: string; language: string; category: string; components: unknown[];
      };
      await assertAccountOwned(body.accountId, req.auth!.clientId);
      const t = await TemplateService.create({
        accountId: body.accountId,
        name: body.name,
        language: body.language,
        category: body.category as never,
        components: body.components,
      });
      reply.code(201).send({ id: t.id, name: t.name, status: t.status });
    }
  );

  app.post(
    "/api/v1/templates/:id/send",
    {
      preHandler: [authenticate, requireScope("messages:write")],
      schema: {
        tags: ["templates"],
        summary: "Send an approved template message",
        security: [{ apiKey: [] }],
        params: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
        body: {
          type: "object",
          required: ["to"],
          properties: { to: { type: "string" }, variables: { type: "array", items: { type: "string" } } },
        },
      },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = req.body as { to: string; variables?: string[] };
      const template = await TemplateService.getById(id);
      await assertAccountOwned(template.whatsappAccountId, req.auth!.clientId);
      const msg = await TemplateService.send(id, body.to, body.variables ?? []);
      reply.code(201).send({ id: msg.id, status: msg.status });
    }
  );
}
