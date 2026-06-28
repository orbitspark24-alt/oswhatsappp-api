import { prisma } from "../db/prisma";
import { TemplateService } from "./TemplateService";
import { logger } from "../lib/logger";
import { ServiceError } from "./errors";

export interface BroadcastRecipient {
  to: string;
  variables?: string[];
}

export interface BroadcastSummary {
  total: number;
  sent: number;
  failed: number;
  errors: Array<{ to: string; error: string }>;
}

// Resolve the throttle for an account from its plan's rateLimitPerSecond (default 10/s).
// NOTE: this controls our own send pacing. Meta separately enforces 24h messaging tiers
// (1K / 10K / 100K / unlimited unique recipients) per WABA — those are tracked by Meta and
// surface as send errors if exceeded; honor them by keeping broadcasts within the client's tier.
async function ratePerSecondForAccount(accountId: string): Promise<number> {
  const sub = await prisma.subscription.findFirst({
    where: { whatsappAccountId: accountId, status: { in: ["ACTIVE", "PAST_DUE"] } },
    include: { plan: true },
    orderBy: { createdAt: "desc" },
  });
  return sub?.plan.rateLimitPerSecond ?? 10;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const BroadcastService = {
  // Queue and rate-limit a bulk template send. Processes recipients sequentially, spacing
  // sends to respect the plan's per-second rate. For very large jobs / multi-process scale,
  // swap this in-process runner for BullMQ + Redis (dependency already present) without
  // changing callers.
  async broadcastTemplate(
    templateId: string,
    recipients: BroadcastRecipient[]
  ): Promise<BroadcastSummary> {
    const template = await TemplateService.getById(templateId);
    if (template.status !== "APPROVED") {
      throw new ServiceError(`Template ${template.name} is ${template.status}, not APPROVED.`, 409);
    }

    const ratePerSecond = await ratePerSecondForAccount(template.whatsappAccountId);
    const delayMs = Math.max(0, Math.floor(1000 / ratePerSecond));

    const summary: BroadcastSummary = { total: recipients.length, sent: 0, failed: 0, errors: [] };

    for (let i = 0; i < recipients.length; i++) {
      const r = recipients[i];
      try {
        await TemplateService.send(templateId, r.to, r.variables ?? []);
        summary.sent++;
      } catch (err) {
        summary.failed++;
        summary.errors.push({ to: r.to, error: (err as Error).message });
      }
      if (i < recipients.length - 1 && delayMs > 0) await sleep(delayMs);
    }

    logger.info(
      { templateId, total: summary.total, sent: summary.sent, failed: summary.failed, ratePerSecond },
      "Broadcast complete"
    );
    return summary;
  },
};
