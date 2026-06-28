import { prisma } from "../db/prisma";

export const UsageRepository = {
  // One usage record per (account, cycleStart). Created on first message of a cycle.
  upsertForCycle(params: {
    whatsappAccountId: string;
    subscriptionId?: string;
    cycleStart: Date;
    cycleEnd: Date;
  }) {
    return prisma.usageRecord.upsert({
      where: {
        whatsappAccountId_cycleStart: {
          whatsappAccountId: params.whatsappAccountId,
          cycleStart: params.cycleStart,
        },
      },
      create: {
        whatsappAccountId: params.whatsappAccountId,
        subscriptionId: params.subscriptionId,
        cycleStart: params.cycleStart,
        cycleEnd: params.cycleEnd,
      },
      update: {},
    });
  },

  findForCycle(whatsappAccountId: string, cycleStart: Date) {
    return prisma.usageRecord.findUnique({
      where: { whatsappAccountId_cycleStart: { whatsappAccountId, cycleStart } },
    });
  },

  increment(whatsappAccountId: string, cycleStart: Date, field: "messagesSent" | "messagesReceived") {
    return prisma.usageRecord.update({
      where: { whatsappAccountId_cycleStart: { whatsappAccountId, cycleStart } },
      data: { [field]: { increment: 1 } },
    });
  },

  setOverageFlag(whatsappAccountId: string, cycleStart: Date, overageFlag: boolean) {
    return prisma.usageRecord.update({
      where: { whatsappAccountId_cycleStart: { whatsappAccountId, cycleStart } },
      data: { overageFlag },
    });
  },

  listByAccount(whatsappAccountId: string) {
    return prisma.usageRecord.findMany({
      where: { whatsappAccountId },
      orderBy: { cycleStart: "desc" },
    });
  },
};
