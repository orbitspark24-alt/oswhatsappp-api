import { FastifyInstance } from "fastify";
import { authenticate, requireScope } from "../auth";
import { ContactService } from "../../services/ContactService";

// /api/v1/contacts — manage the client's audience and opt-in/out state.
export function registerContactRoutes(app: FastifyInstance): void {
  app.get(
    "/api/v1/contacts",
    {
      preHandler: [authenticate, requireScope("contacts:read")],
      schema: {
        tags: ["contacts"],
        summary: "List contacts",
        security: [{ apiKey: [] }],
        querystring: { type: "object", properties: { optInStatus: { type: "string" } } },
      },
    },
    async (req, reply) => {
      const q = req.query as { optInStatus?: string };
      reply.send({ data: await ContactService.list(req.auth!.clientId, { optInStatus: q.optInStatus }) });
    }
  );

  app.post(
    "/api/v1/contacts",
    {
      preHandler: [authenticate, requireScope("contacts:write")],
      schema: {
        tags: ["contacts"],
        summary: "Create or update a contact",
        security: [{ apiKey: [] }],
        body: {
          type: "object",
          required: ["phoneNumber"],
          properties: {
            phoneNumber: { type: "string" },
            name: { type: "string" },
            whatsappAccountId: { type: "string" },
            tags: { type: "array", items: { type: "string" } },
          },
        },
      },
    },
    async (req, reply) => {
      const body = req.body as { phoneNumber: string; name?: string; whatsappAccountId?: string; tags?: string[] };
      const contact = await ContactService.upsert({ clientId: req.auth!.clientId, ...body });
      reply.code(201).send(contact);
    }
  );

  app.post(
    "/api/v1/contacts/:phoneNumber/opt",
    {
      preHandler: [authenticate, requireScope("contacts:write")],
      schema: {
        tags: ["contacts"],
        summary: "Set a contact's opt-in/opt-out status",
        security: [{ apiKey: [] }],
        params: { type: "object", required: ["phoneNumber"], properties: { phoneNumber: { type: "string" } } },
        body: { type: "object", required: ["optedIn"], properties: { optedIn: { type: "boolean" } } },
      },
    },
    async (req, reply) => {
      const { phoneNumber } = req.params as { phoneNumber: string };
      const { optedIn } = req.body as { optedIn: boolean };
      const contact = await ContactService.setOptIn(req.auth!.clientId, phoneNumber, optedIn);
      reply.send(contact);
    }
  );
}
