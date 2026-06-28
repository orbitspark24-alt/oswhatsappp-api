import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";

export const SubscriptionRepository = {
  create(data: Prisma.SubscriptionCreateInput) {
    return prisma.subscription.create({ data });
  },
  findById(id: string) {
    return prisma.subscription.findUnique({
      where: { id },
      include: { plan: true, client: true, whatsappAccount: true },
    });
  },
  list(params?: { clientId?: string; status?: string }) {
    return prisma.subscription.findMany({
      where: { clientId: params?.clientId, status: params?.status },
      orderBy: { createdAt: "desc" },
      include: { plan: true, client: { select: { id: true, name: true } } },
    });
  },
  // Subscriptions whose renewal is due on/before `asOf` and that are still billable.
  findDueForRenewal(asOf: Date) {
    return prisma.subscription.findMany({
      where: { status: { in: ["ACTIVE", "PAST_DUE"] }, renewalDate: { lte: asOf } },
      include: { plan: true },
    });
  },
  update(id: string, data: Prisma.SubscriptionUpdateInput) {
    return prisma.subscription.update({ where: { id }, data });
  },
};
