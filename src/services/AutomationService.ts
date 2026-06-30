import { z } from "zod";
import { prisma } from "../db/prisma";
import { MessageService } from "./MessageService";
import { ContactService } from "./ContactService";
import { ConversationService } from "./ConversationService";
import { AiReplyService } from "./AiReplyService";
import { AutomationType } from "../types/enums";
import { audit } from "../lib/audit";
import { logger } from "../lib/logger";
import { NotFoundError } from "./errors";

export const UpsertRuleInput = z.object({
  clientId: z.string().min(1),
  whatsappAccountId: z.string().nullable().optional(),
  type: AutomationType,
  enabled: z.boolean().default(true),
  priority: z.number().int().default(100),
  config: z.record(z.unknown()).default({}),
});
export type UpsertRuleInput = z.infer<typeof UpsertRuleInput>;

// Order automations run in; first one that produces a reply wins (avoids double-texting).
const TYPE_ORDER: Record<string, number> = { OPT_OUT: 0, WELCOME: 1, KEYWORD: 2, AWAY: 3, AI: 4 };

export const AutomationService = {
  // ---- CRUD (client self-serve via the portal) ----
  list(clientId: string) {
    return prisma.automationRule.findMany({ where: { clientId }, orderBy: { priority: "asc" } });
  },

  async create(input: z.input<typeof UpsertRuleInput>) {
    const data = UpsertRuleInput.parse(input);
    const rule = await prisma.automationRule.create({
      data: {
        clientId: data.clientId,
        whatsappAccountId: data.whatsappAccountId ?? null,
        type: data.type,
        enabled: data.enabled,
        priority: data.priority,
        configJson: JSON.stringify(data.config),
      },
    });
    await audit({ actorType: "admin", action: "automation.create", targetType: "automation_rule", targetId: rule.id });
    return rule;
  },

  async update(id: string, patch: { enabled?: boolean; priority?: number; config?: Record<string, unknown> }) {
    const existing = await prisma.automationRule.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError(`Automation rule ${id} not found.`);
    return prisma.automationRule.update({
      where: { id },
      data: {
        enabled: patch.enabled ?? existing.enabled,
        priority: patch.priority ?? existing.priority,
        configJson: patch.config ? JSON.stringify(patch.config) : existing.configJson,
      },
    });
  },

  async remove(id: string) {
    await prisma.automationRule.delete({ where: { id } }).catch(() => undefined);
    return { ok: true };
  },

  // ---- Engine: runs on each inbound text message ----
  // Best-effort; never throws into the webhook path.
  async handleInbound(account: { id: string; clientId: string }, contact: string, text: string): Promise<void> {
    if (!text) return;
    try {
      const rules = (await prisma.automationRule.findMany({ where: { clientId: account.clientId, enabled: true } }))
        .filter((r) => !r.whatsappAccountId || r.whatsappAccountId === account.id)
        .map((r) => ({ ...r, config: safeParse(r.configJson) }))
        .sort((a, b) => (TYPE_ORDER[a.type] - TYPE_ORDER[b.type]) || a.priority - b.priority);

      // 1) OPT_OUT is always evaluated first and is terminal.
      const optOut = rules.find((r) => r.type === "OPT_OUT");
      if (optOut) {
        const keywords: string[] = (optOut.config.keywords as string[]) ?? ["STOP", "UNSUBSCRIBE"];
        if (matchesKeyword(text, keywords, "contains")) {
          await ContactService.setOptIn(account.clientId, contact, false).catch(() => undefined);
          const confirm = (optOut.config.confirmMessage as string) || "You've been unsubscribed. Reply START to opt back in.";
          await reply(account.id, contact, confirm);
          return;
        }
      }

      // Don't auto-message contacts who have opted out.
      const existingContact = await prisma.contact.findUnique({
        where: { clientId_phoneNumber: { clientId: account.clientId, phoneNumber: contact } },
      });
      if (existingContact?.optInStatus === "OPTED_OUT") return;

      // First-inbound check for WELCOME (the just-persisted inbound counts as 1).
      const inboundCount = await prisma.message.count({
        where: { whatsappAccountId: account.id, direction: "INBOUND", fromNumber: contact },
      });

      // 2) First matching auto-reply wins.
      for (const rule of rules) {
        if (rule.type === "OPT_OUT") continue;

        if (rule.type === "WELCOME" && inboundCount <= 1) {
          const msg = (rule.config.message as string) || "Hi! Thanks for messaging us. How can we help?";
          await reply(account.id, contact, msg);
          return;
        }

        if (rule.type === "KEYWORD") {
          const keywords: string[] = (rule.config.keywords as string[]) ?? [];
          const mode = (rule.config.match as "contains" | "exact") ?? "contains";
          if (matchesKeyword(text, keywords, mode)) {
            await reply(account.id, contact, (rule.config.reply as string) || "");
            return;
          }
        }

        if (rule.type === "AWAY" && isOutsideBusinessHours(rule.config)) {
          await reply(account.id, contact, (rule.config.message as string) || "We're currently away and will reply during business hours.");
          return;
        }

        if (rule.type === "AI" && AiReplyService.isConfigured()) {
          const thread = await ConversationService.getThread(account.id, contact);
          const history = thread.map((m) => ({
            role: (m.direction === "INBOUND" ? "user" : "assistant") as "user" | "assistant",
            text: m.text,
          }));
          const aiText = await AiReplyService.generate({
            systemPrompt: (rule.config.systemPrompt as string) || "You are a helpful customer support assistant.",
            history,
            model: rule.config.model as string | undefined,
            maxChars: rule.config.maxChars as number | undefined,
          });
          if (aiText) {
            await reply(account.id, contact, aiText);
            return;
          }
        }
      }
    } catch (err) {
      logger.error({ err: (err as Error).message, accountId: account.id }, "Automation engine error");
    }
  },
};

async function reply(accountId: string, to: string, body: string) {
  if (!body) return;
  await MessageService.sendText(accountId, to, body).catch((err) =>
    logger.warn({ err: (err as Error).message }, "Automation reply send failed")
  );
}

function safeParse(json: string): Record<string, unknown> {
  try {
    return JSON.parse(json);
  } catch {
    return {};
  }
}

function matchesKeyword(text: string, keywords: string[], mode: "contains" | "exact"): boolean {
  const t = text.trim().toLowerCase();
  return keywords.some((k) => {
    const kw = k.trim().toLowerCase();
    if (!kw) return false;
    return mode === "exact" ? t === kw : t.includes(kw);
  });
}

// businessHours config: { timezone, hours: [{ day: 0-6 (Sun=0), start: "HH:MM", end: "HH:MM" }] }
// Returns true when the current time is OUTSIDE all configured open windows (so an away
// message should fire). Empty hours = always open (away never fires).
function isOutsideBusinessHours(config: Record<string, unknown>): boolean {
  const hours = (config.hours as Array<{ day: number; start: string; end: string }>) ?? [];
  if (hours.length === 0) return false;
  const tz = (config.timezone as string) || "UTC";

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const wdMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const weekday = wdMap[parts.find((p) => p.type === "weekday")?.value ?? "Sun"] ?? 0;
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const nowMin = hour * 60 + minute;

  const open = hours.some((h) => {
    if (h.day !== weekday) return false;
    const [sh, sm] = h.start.split(":").map(Number);
    const [eh, em] = h.end.split(":").map(Number);
    return nowMin >= sh * 60 + sm && nowMin < eh * 60 + em;
  });
  return !open;
}
