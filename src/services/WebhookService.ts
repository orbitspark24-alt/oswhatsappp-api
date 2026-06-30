import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "../db/prisma";
import { MessageRepository } from "../repositories/MessageRepository";
import { WhatsAppAccountRepository } from "../repositories/WhatsAppAccountRepository";
import { UsageService } from "./UsageService";
import { AutomationService } from "./AutomationService";
import { eventBus } from "../events/EventBus";
import { config } from "../config";
import { logger } from "../lib/logger";

// Best-effort extraction of the text body from an inbound message payload.
function inboundText(msg: { type?: string; text?: { body?: string }; [k: string]: unknown }): string {
  if (msg.type === "text") return msg.text?.body ?? "";
  return "";
}

// Maps Meta delivery status strings to our MessageStatus enum values.
const STATUS_MAP: Record<string, string> = {
  sent: "SENT",
  delivered: "DELIVERED",
  read: "READ",
  failed: "FAILED",
};

export const WebhookService = {
  // Verify Meta's X-Hub-Signature-256 header against the raw request body using the Tech
  // Provider app secret. All WABAs under one app share this secret. Returns false on mismatch.
  verifySignature(rawBody: Buffer | string, signatureHeader?: string): boolean {
    if (!config.meta.appSecret) {
      logger.warn("META_APP_SECRET unset — cannot verify webhook signature; rejecting.");
      return false;
    }
    if (!signatureHeader?.startsWith("sha256=")) return false;

    const expected = createHmac("sha256", config.meta.appSecret)
      .update(rawBody)
      .digest("hex");
    const provided = signatureHeader.slice("sha256=".length);

    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(provided, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  },

  // GET verification handshake. Meta calls the callback URL with hub.* params at setup time.
  // Returns the challenge string to echo back when the verify token matches, else null.
  handleVerification(query: Record<string, string | undefined>): string | null {
    const mode = query["hub.mode"];
    const token = query["hub.verify_token"];
    const challenge = query["hub.challenge"];
    if (mode === "subscribe" && token && token === config.meta.defaultWebhookVerifyToken) {
      return challenge ?? "";
    }
    return null;
  },

  // Process a verified webhook payload: persist inbound messages, update delivery statuses,
  // and meter inbound usage. Routes each change to the right account by phone_number_id.
  async processEvent(payload: WebhookPayload): Promise<{ inbound: number; statuses: number }> {
    let inbound = 0;
    let statuses = 0;

    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value;
        const phoneNumberId = value?.metadata?.phone_number_id;
        if (!phoneNumberId) continue;

        const account = await WhatsAppAccountRepository.findByPhoneNumberId(phoneNumberId);
        if (!account) {
          logger.warn({ phoneNumberId }, "Webhook for unknown phone_number_id; ignoring.");
          continue;
        }

        // Inbound messages
        for (const msg of value.messages ?? []) {
          // Dedupe — Meta may retry deliveries.
          const existing = msg.id ? await MessageRepository.findByWaMessageId(msg.id) : null;
          if (existing) continue;

          const created = await MessageRepository.create({
            whatsappAccount: { connect: { id: account.id } },
            direction: "INBOUND",
            waMessageId: msg.id,
            fromNumber: msg.from ?? "unknown",
            toNumber: account.displayPhoneNumber ?? account.phoneNumberId,
            type: msg.type ?? "unknown",
            contentJson: JSON.stringify(msg),
            status: "DELIVERED",
          });
          await UsageService.recordMessage(account.id, "INBOUND").catch(() => undefined);
          eventBus.emit("message.inbound", {
            clientId: account.clientId,
            accountId: account.id,
            messageId: created.id,
            from: msg.from ?? "unknown",
            type: msg.type ?? "unknown",
            content: msg,
          });
          // Run client-configured automations (welcome/keyword/away/opt-out/AI) on the reply.
          await AutomationService.handleInbound(
            { id: account.id, clientId: account.clientId },
            msg.from ?? "unknown",
            inboundText(msg)
          );
          inbound++;
        }

        // Delivery/read status updates for previously sent outbound messages
        for (const st of value.statuses ?? []) {
          const mapped = STATUS_MAP[st.status ?? ""] ?? null;
          if (mapped && st.id) {
            await MessageRepository.updateStatus(st.id, mapped);
            eventBus.emit("message.status", {
              clientId: account.clientId,
              accountId: account.id,
              waMessageId: st.id,
              status: mapped,
            });
            statuses++;
          }
        }
      }
    }
    return { inbound, statuses };
  },

  // Recent inbound/status activity for diagnostics.
  recentInbound(take = 20) {
    return prisma.message.findMany({
      where: { direction: "INBOUND" },
      orderBy: { createdAt: "desc" },
      take,
    });
  },
};

// Minimal shape of the Meta WhatsApp webhook payload we consume.
export interface WebhookPayload {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{
      field?: string;
      value?: {
        metadata?: { phone_number_id?: string; display_phone_number?: string };
        messages?: Array<{ id?: string; from?: string; type?: string; timestamp?: string; [k: string]: unknown }>;
        statuses?: Array<{ id?: string; status?: string; recipient_id?: string; [k: string]: unknown }>;
      };
    }>;
  }>;
}
