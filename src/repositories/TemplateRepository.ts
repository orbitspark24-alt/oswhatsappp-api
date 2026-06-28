import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";

export const TemplateRepository = {
  create(data: Prisma.TemplateCreateInput) {
    return prisma.template.create({ data });
  },
  findById(id: string) {
    return prisma.template.findUnique({ where: { id } });
  },
  findByName(whatsappAccountId: string, name: string, language: string) {
    return prisma.template.findUnique({
      where: { whatsappAccountId_name_language: { whatsappAccountId, name, language } },
    });
  },
  list(whatsappAccountId: string) {
    return prisma.template.findMany({
      where: { whatsappAccountId },
      orderBy: { createdAt: "desc" },
    });
  },
  update(id: string, data: Prisma.TemplateUpdateInput) {
    return prisma.template.update({ where: { id }, data });
  },
};
