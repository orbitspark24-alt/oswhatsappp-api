import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";

export const MessageRepository = {
  create(data: Prisma.MessageCreateInput) {
    return prisma.message.create({ data });
  },
  findByWaMessageId(waMessageId: string) {
    return prisma.message.findUnique({ where: { waMessageId } });
  },
  updateStatus(waMessageId: string, status: string) {
    return prisma.message.updateMany({ where: { waMessageId }, data: { status } });
  },
  update(id: string, data: Prisma.MessageUpdateInput) {
    return prisma.message.update({ where: { id }, data });
  },
  // Conversation log: messages for an account, optionally filtered to one contact number.
  list(params: { whatsappAccountId: string; contact?: string; take?: number }) {
    return prisma.message.findMany({
      where: {
        whatsappAccountId: params.whatsappAccountId,
        ...(params.contact
          ? { OR: [{ fromNumber: params.contact }, { toNumber: params.contact }] }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: params.take ?? 50,
    });
  },
};
