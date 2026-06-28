import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";

export const InvoiceRepository = {
  create(data: Prisma.InvoiceCreateInput) {
    return prisma.invoice.create({ data });
  },
  findById(id: string) {
    return prisma.invoice.findUnique({
      where: { id },
      include: { subscription: { include: { plan: true } }, payments: true, client: true },
    });
  },
  // Used to avoid double-billing a subscription for the same period.
  findBySubscriptionAndPeriod(subscriptionId: string, periodStart: Date) {
    return prisma.invoice.findFirst({ where: { subscriptionId, periodStart } });
  },
  list(params?: { clientId?: string; status?: string }) {
    return prisma.invoice.findMany({
      where: { clientId: params?.clientId, status: params?.status },
      orderBy: { createdAt: "desc" },
      include: { client: { select: { id: true, name: true } } },
    });
  },
  // Issued/overdue invoices past their due date, for the auto-suspend enforcement run.
  findOverdue(asOf: Date) {
    return prisma.invoice.findMany({
      where: { status: { in: ["ISSUED", "OVERDUE"] }, dueAt: { lt: asOf } },
      include: { subscription: { include: { whatsappAccount: true } } },
    });
  },
  update(id: string, data: Prisma.InvoiceUpdateInput) {
    return prisma.invoice.update({ where: { id }, data });
  },
};
