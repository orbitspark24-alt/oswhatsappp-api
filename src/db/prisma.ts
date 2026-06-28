import { PrismaClient } from "@prisma/client";

// Single shared client; ts-node-dev / hot reload safe via globalThis cache.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
