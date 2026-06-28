import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";

export const ContactRepository = {
  upsert(clientId: string, phoneNumber: string, data: Prisma.ContactUpdateInput & Prisma.ContactCreateInput) {
    return prisma.contact.upsert({
      where: { clientId_phoneNumber: { clientId, phoneNumber } },
      create: data,
      update: data,
    });
  },
  findByPhone(clientId: string, phoneNumber: string) {
    return prisma.contact.findUnique({ where: { clientId_phoneNumber: { clientId, phoneNumber } } });
  },
  list(clientId: string, params?: { optInStatus?: string }) {
    return prisma.contact.findMany({
      where: { clientId, optInStatus: params?.optInStatus },
      orderBy: { createdAt: "desc" },
    });
  },
  update(id: string, data: Prisma.ContactUpdateInput) {
    return prisma.contact.update({ where: { id }, data });
  },
};
