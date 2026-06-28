import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";

// Data access for provisioned WhatsApp accounts. Secret columns hold ciphertext only —
// callers encrypt/decrypt via src/lib/crypto.ts, never store plaintext here.
export const WhatsAppAccountRepository = {
  create(data: Prisma.WhatsAppAccountCreateInput) {
    return prisma.whatsAppAccount.create({ data });
  },

  findById(id: string) {
    return prisma.whatsAppAccount.findUnique({ where: { id } });
  },

  findByPhoneNumberId(phoneNumberId: string) {
    return prisma.whatsAppAccount.findUnique({ where: { phoneNumberId } });
  },

  list(params?: { clientId?: string; status?: string }) {
    return prisma.whatsAppAccount.findMany({
      where: {
        clientId: params?.clientId,
        status: params?.status,
      },
      orderBy: { createdAt: "desc" },
      include: { client: { select: { id: true, name: true } } },
    });
  },

  countByClient(clientId: string) {
    return prisma.whatsAppAccount.count({
      where: { clientId, status: { not: "DEPROVISIONED" } },
    });
  },

  update(id: string, data: Prisma.WhatsAppAccountUpdateInput) {
    return prisma.whatsAppAccount.update({ where: { id }, data });
  },
};
