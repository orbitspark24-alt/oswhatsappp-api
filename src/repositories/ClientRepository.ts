import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";

// Data access for clients. Services depend on this, not on prisma directly, so the
// storage layer can change without touching business logic.
export const ClientRepository = {
  create(data: Prisma.ClientCreateInput) {
    return prisma.client.create({ data });
  },

  findById(id: string) {
    return prisma.client.findUnique({ where: { id } });
  },

  findByEmail(email: string) {
    return prisma.client.findUnique({ where: { email } });
  },

  list(params?: { status?: string; skip?: number; take?: number }) {
    return prisma.client.findMany({
      where: params?.status ? { status: params.status } : undefined,
      orderBy: { createdAt: "desc" },
      skip: params?.skip,
      take: params?.take,
      include: { _count: { select: { whatsappAccounts: true } } },
    });
  },

  update(id: string, data: Prisma.ClientUpdateInput) {
    return prisma.client.update({ where: { id }, data });
  },

  delete(id: string) {
    return prisma.client.delete({ where: { id } });
  },
};
