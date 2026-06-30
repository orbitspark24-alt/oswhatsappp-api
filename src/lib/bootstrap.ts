import { createHash } from "crypto";
import { prisma } from "../db/prisma";
import { logger } from "./logger";

// Idempotent first-boot setup for a fresh deployment: ensures an admin login and the default
// plans exist, so a newly deployed instance is immediately usable without shell access.
// Matches AdminService's hashing scheme ("sha256$" + sha256(password)).
function hash(input: string): string {
  return "sha256$" + createHash("sha256").update(input).digest("hex");
}

export async function ensureBootstrap(): Promise<void> {
  if (process.env.NODE_ENV === "test") return;

  try {
    const adminCount = await prisma.admin.count();
    if (adminCount === 0) {
      const email = process.env.ADMIN_EMAIL || "admin@demo.local";
      const password = process.env.ADMIN_PASSWORD || "changeme";
      await prisma.admin.create({
        data: { email, name: process.env.ADMIN_NAME || "Admin", passwordHash: hash(password) },
      });
      logger.info({ email }, "Bootstrap: created initial admin login");
    }

    const planCount = await prisma.plan.count();
    if (planCount === 0) {
      await prisma.plan.createMany({
        data: [
          { name: "Starter", priceCents: 1900, currency: "USD", messageQuota: 1000, rateLimitPerSecond: 5, maxWhatsAppAccounts: 1, featureFlagsJson: "{}" },
          { name: "Pro", priceCents: 4900, currency: "USD", messageQuota: 10000, rateLimitPerSecond: 20, maxWhatsAppAccounts: 3, featureFlagsJson: "{}" },
          { name: "Business", priceCents: 9900, currency: "USD", messageQuota: 50000, rateLimitPerSecond: 80, maxWhatsAppAccounts: 10, featureFlagsJson: "{}" },
        ],
      });
      logger.info("Bootstrap: seeded default plans (Starter/Pro/Business)");
    }
  } catch (err) {
    logger.error({ err: (err as Error).message }, "Bootstrap failed (continuing)");
  }
}
