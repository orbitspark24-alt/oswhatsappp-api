import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";

export const ApiKeyRepository = {
  create(data: Prisma.ApiKeyCreateInput) {
    return prisma.apiKey.create({ data });
  },
  findByHash(keyHash: string) {
    return prisma.apiKey.findFirst({
      where: { keyHash, status: "ACTIVE" },
      include: { client: true },
    });
  },
  listByClient(clientId: string) {
    return prisma.apiKey.findMany({ where: { clientId }, orderBy: { createdAt: "desc" } });
  },
  findById(id: string) {
    return prisma.apiKey.findUnique({ where: { id } });
  },
  update(id: string, data: Prisma.ApiKeyUpdateInput) {
    return prisma.apiKey.update({ where: { id }, data });
  },
  touchLastUsed(id: string) {
    return prisma.apiKey.update({ where: { id }, data: { lastUsedAt: new Date() } });
  },
};
