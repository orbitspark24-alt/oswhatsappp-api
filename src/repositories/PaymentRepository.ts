import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";

export const PaymentRepository = {
  create(data: Prisma.PaymentCreateInput) {
    return prisma.payment.create({ data });
  },
  listByInvoice(invoiceId: string) {
    return prisma.payment.findMany({ where: { invoiceId }, orderBy: { createdAt: "desc" } });
  },
};
