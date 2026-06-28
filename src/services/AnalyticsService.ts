import { prisma } from "../db/prisma";
import { UsageService } from "./UsageService";

export interface AccountAnalytics {
  accountId: string;
  phoneNumberId: string;
  status: string;
  messages: { sent: number; delivered: number; read: number; failed: number; inbound: number };
  quota: { used: number; quota: number; remaining: number; overage: boolean } | null;
  estimatedCostCents: number;
}

export interface ClientAnalytics {
  clientId: string;
  clientName: string;
  accounts: AccountAnalytics[];
  totals: { sent: number; delivered: number; read: number; failed: number; inbound: number };
}

// Aggregates messaging + quota + cost stats for console dashboards and the API.
export const AnalyticsService = {
  async forAccount(accountId: string): Promise<AccountAnalytics> {
    const account = await prisma.whatsAppAccount.findUniqueOrThrow({ where: { id: accountId } });

    // Group outbound messages by status, plus inbound count, in a few cheap aggregate queries.
    const [sent, delivered, read, failed, inbound] = await Promise.all([
      prisma.message.count({ where: { whatsappAccountId: accountId, direction: "OUTBOUND" } }),
      prisma.message.count({ where: { whatsappAccountId: accountId, status: "DELIVERED", direction: "OUTBOUND" } }),
      prisma.message.count({ where: { whatsappAccountId: accountId, status: "READ", direction: "OUTBOUND" } }),
      prisma.message.count({ where: { whatsappAccountId: accountId, status: "FAILED", direction: "OUTBOUND" } }),
      prisma.message.count({ where: { whatsappAccountId: accountId, direction: "INBOUND" } }),
    ]);

    let quota: AccountAnalytics["quota"] = null;
    try {
      const q = await UsageService.getQuotaStatus(accountId);
      quota = { used: q.used, quota: q.quota, remaining: q.remaining, overage: q.overage };
    } catch {
      /* no subscription metering this account */
    }

    // Simple cost model: only overage messages beyond quota are charged, at a flat rate.
    // Real per-conversation pricing (Meta category-based) can replace this later.
    const OVERAGE_COST_CENTS = 1;
    const overageCount = quota ? Math.max(0, quota.used - quota.quota) : 0;

    return {
      accountId,
      phoneNumberId: account.phoneNumberId,
      status: account.status,
      messages: { sent, delivered, read, failed, inbound },
      quota,
      estimatedCostCents: overageCount * OVERAGE_COST_CENTS,
    };
  },

  async forClient(clientId: string): Promise<ClientAnalytics> {
    const client = await prisma.client.findUniqueOrThrow({ where: { id: clientId } });
    const accounts = await prisma.whatsAppAccount.findMany({ where: { clientId } });

    const perAccount = await Promise.all(accounts.map((a) => AnalyticsService.forAccount(a.id)));
    const totals = perAccount.reduce(
      (acc, a) => ({
        sent: acc.sent + a.messages.sent,
        delivered: acc.delivered + a.messages.delivered,
        read: acc.read + a.messages.read,
        failed: acc.failed + a.messages.failed,
        inbound: acc.inbound + a.messages.inbound,
      }),
      { sent: 0, delivered: 0, read: 0, failed: 0, inbound: 0 }
    );

    return { clientId, clientName: client.name, accounts: perAccount, totals };
  },
};
