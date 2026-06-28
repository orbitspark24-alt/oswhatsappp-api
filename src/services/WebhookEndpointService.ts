import { randomBytes } from "crypto";
import { z } from "zod";
import { prisma } from "../db/prisma";
import { ClientService } from "./ClientService";
import { audit } from "../lib/audit";
import { NotFoundError } from "./errors";

export const RegisterEndpointInput = z.object({
  clientId: z.string().min(1),
  url: z.string().url(),
  events: z.array(z.string()).default(["*"]),
});
export type RegisterEndpointInput = z.infer<typeof RegisterEndpointInput>;

// The CRM registers a callback URL here; the platform signs outbound payloads with the
// returned secret (HMAC) so the CRM can verify authenticity. Outbound delivery itself is
// wired to the event bus in step 7.
export const WebhookEndpointService = {
  async register(input: RegisterEndpointInput) {
    const data = RegisterEndpointInput.parse(input);
    await ClientService.getById(data.clientId);
    const secret = "whsec_" + randomBytes(24).toString("hex");
    const endpoint = await prisma.webhookEndpoint.create({
      data: {
        clientId: data.clientId,
        url: data.url,
        secret,
        eventsJson: JSON.stringify(data.events),
      },
    });
    await audit({
      actorType: "admin",
      action: "webhook_endpoint.register",
      targetType: "webhook_endpoint",
      targetId: endpoint.id,
      metadata: { clientId: data.clientId, url: data.url },
    });
    // Secret returned once for the caller to store.
    return { ...endpoint };
  },

  list(clientId: string) {
    return prisma.webhookEndpoint.findMany({ where: { clientId }, orderBy: { createdAt: "desc" } });
  },

  async disable(id: string) {
    const existing = await prisma.webhookEndpoint.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError(`Webhook endpoint ${id} not found.`);
    return prisma.webhookEndpoint.update({ where: { id }, data: { status: "DISABLED" } });
  },
};
