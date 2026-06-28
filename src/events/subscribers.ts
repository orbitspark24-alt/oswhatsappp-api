import { eventBus } from "./EventBus";
import { OutboundWebhookService } from "../services/OutboundWebhookService";
import { logger } from "../lib/logger";

let initialized = false;

// Wires domain events to outbound CRM webhook delivery. Call once at process startup
// (API server, webhook receiver). Idempotent.
export function initEventSubscribers(): void {
  if (initialized) return;
  initialized = true;

  // Events the CRM cares about are forwarded to the client's registered callback URLs.
  // Endpoint-level event filtering happens in OutboundWebhookService.
  eventBus.on("message.inbound", (p) => OutboundWebhookService.deliver(p.clientId, "message.inbound", p));
  eventBus.on("message.status", (p) => OutboundWebhookService.deliver(p.clientId, "message.status", p));
  eventBus.on("message.sent", (p) => OutboundWebhookService.deliver(p.clientId, "message.sent", p));
  eventBus.on("account.suspended", (p) => OutboundWebhookService.deliver(p.clientId, "account.suspended", p));
  eventBus.on("subscription.suspended", (p) =>
    OutboundWebhookService.deliver(p.clientId, "subscription.suspended", p)
  );
  eventBus.on("invoice.created", (p) => OutboundWebhookService.deliver(p.clientId, "invoice.created", p));
  eventBus.on("invoice.paid", (p) => OutboundWebhookService.deliver(p.clientId, "invoice.paid", p));

  logger.info("Event subscribers initialized (outbound CRM webhooks)");
}
