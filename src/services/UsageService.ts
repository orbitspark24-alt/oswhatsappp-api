import { prisma } from "../db/prisma";
import { UsageRepository } from "../repositories/UsageRepository";
import { PlanService } from "./PlanService";
import { currentPeriod } from "../lib/billingDates";
import { NotFoundError } from "./errors";

interface QuotaStatus {
  used: number;
  quota: number;
  remaining: number;
  overage: boolean;
  allowed: boolean;
  cycleStart: Date;
  cycleEnd: Date;
}

// Finds the subscription metering a given WhatsApp account (subscription.whatsappAccountId).
async function subscriptionForAccount(whatsappAccountId: string) {
  return prisma.subscription.findFirst({
    where: { whatsappAccountId, status: { in: ["ACTIVE", "PAST_DUE", "SUSPENDED"] } },
    include: { plan: true },
    orderBy: { createdAt: "desc" },
  });
}

export const UsageService = {
  // Read-only quota status for the current cycle; does not mutate counters.
  // Used by the messaging layer (step 5) to enforce/flag before sending.
  async getQuotaStatus(whatsappAccountId: string): Promise<QuotaStatus> {
    const subscription = await subscriptionForAccount(whatsappAccountId);
    if (!subscription) {
      throw new NotFoundError(`No subscription found metering account ${whatsappAccountId}.`);
    }
    const period = currentPeriod(subscription.startDate);
    const record = await UsageRepository.findForCycle(whatsappAccountId, period.start);
    const used = record?.messagesSent ?? 0;
    const quota = subscription.plan.messageQuota;
    const overage = used >= quota;

    // Hard quota blocks sending once exceeded; otherwise overage is merely flagged.
    const flags = PlanService.featureFlags(subscription.plan);
    const hardQuota = flags.hardQuota === true;

    return {
      used,
      quota,
      remaining: Math.max(0, quota - used),
      overage,
      allowed: !overage || !hardQuota,
      cycleStart: period.start,
      cycleEnd: period.end,
    };
  },

  // Records one message against the current cycle and updates the overage flag.
  async recordMessage(whatsappAccountId: string, direction: "OUTBOUND" | "INBOUND") {
    const subscription = await subscriptionForAccount(whatsappAccountId);
    // Usage is tracked even if no subscription is attached yet, anchored to "now".
    const anchor = subscription?.startDate ?? new Date();
    const period = currentPeriod(anchor);

    await UsageRepository.upsertForCycle({
      whatsappAccountId,
      subscriptionId: subscription?.id,
      cycleStart: period.start,
      cycleEnd: period.end,
    });

    const field = direction === "OUTBOUND" ? "messagesSent" : "messagesReceived";
    const record = await UsageRepository.increment(whatsappAccountId, period.start, field);

    if (subscription && record.messagesSent >= subscription.plan.messageQuota && !record.overageFlag) {
      await UsageRepository.setOverageFlag(whatsappAccountId, period.start, true);
    }
    return record;
  },

  listByAccount(whatsappAccountId: string) {
    return UsageRepository.listByAccount(whatsappAccountId);
  },
};
