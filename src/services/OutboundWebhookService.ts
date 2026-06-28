import { createHmac } from "crypto";
import axios from "axios";
import { prisma } from "../db/prisma";
import { logger } from "../lib/logger";

// Delivers a domain event to a client's registered CRM callback URLs, signing the body with
// the endpoint's secret so the CRM can verify authenticity (X-WAC-Signature-256: sha256=...).
export const OutboundWebhookService = {
  async deliver(clientId: string, event: string, data: unknown): Promise<void> {
    const endpoints = await prisma.webhookEndpoint.findMany({
      where: { clientId, status: "ACTIVE" },
    });

    for (const endpoint of endpoints) {
      let subscribed: string[] = ["*"];
      try {
        subscribed = JSON.parse(endpoint.eventsJson);
      } catch {
        /* default wildcard */
      }
      if (!subscribed.includes("*") && !subscribed.includes(event)) continue;

      const body = JSON.stringify({ event, data, deliveredAt: new Date().toISOString() });
      const signature = "sha256=" + createHmac("sha256", endpoint.secret).update(body).digest("hex");

      try {
        await axios.post(endpoint.url, body, {
          headers: {
            "Content-Type": "application/json",
            "X-WAC-Signature-256": signature,
            "X-WAC-Event": event,
          },
          timeout: 10000,
        });
      } catch (err) {
        // Delivery is best-effort; log and continue. A retry queue can be added later.
        logger.warn(
          { err: (err as Error).message, endpointId: endpoint.id, event },
          "Outbound webhook delivery failed"
        );
      }
    }
  },
};
