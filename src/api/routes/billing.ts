import { FastifyInstance } from "fastify";
import { authenticate, requireScope } from "../auth";
import { BillingService } from "../../services/BillingService";

// /api/v1/billing — read-only billing data for the authenticated client.
export function registerBillingRoutes(app: FastifyInstance): void {
  app.get(
    "/api/v1/billing/invoices",
    {
      preHandler: [authenticate, requireScope("billing:read")],
      schema: {
        tags: ["billing"],
        summary: "List your invoices",
        security: [{ apiKey: [] }],
        querystring: { type: "object", properties: { status: { type: "string" } } },
      },
    },
    async (req, reply) => {
      const q = req.query as { status?: string };
      const invoices = await BillingService.listInvoices({ clientId: req.auth!.clientId, status: q.status });
      reply.send({
        data: invoices.map((i) => ({
          id: i.id,
          amountCents: i.amountCents,
          currency: i.currency,
          status: i.status,
          periodStart: i.periodStart,
          periodEnd: i.periodEnd,
          dueAt: i.dueAt,
          paidAt: i.paidAt,
        })),
      });
    }
  );
}
