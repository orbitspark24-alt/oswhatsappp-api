import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";

export const PlanRepository = {
  create(data: Prisma.PlanCreateInput) {
    return prisma.plan.create({ data });
  },
  findById(id: string) {
    return prisma.plan.findUnique({ where: { id } });
  },
  findByName(name: string) {
    return prisma.plan.findUnique({ where: { name } });
  },
  list(params?: { activeOnly?: boolean }) {
    return prisma.plan.findMany({
      where: params?.activeOnly ? { active: true } : undefined,
      orderBy: { priceCents: "asc" },
    });
  },
  update(id: string, data: Prisma.PlanUpdateInput) {
    return prisma.plan.update({ where: { id }, data });
  },
};
