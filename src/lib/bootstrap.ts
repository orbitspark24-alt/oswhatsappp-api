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
    // Admin login: if ADMIN_EMAIL + ADMIN_PASSWORD are set, upsert that admin on every boot —
    // so the password is always recoverable by changing the env var and redeploying. If they're
    // not set, create a default admin only when none exists yet.
    const envEmail = process.env.ADMIN_EMAIL;
    const envPassword = process.env.ADMIN_PASSWORD;
    if (envEmail && envPassword) {
      await prisma.admin.upsert({
        where: { email: envEmail },
        update: { passwordHash: hash(envPassword) },
        create: { email: envEmail, name: process.env.ADMIN_NAME || "Admin", passwordHash: hash(envPassword) },
      });
      logger.info({ email: envEmail }, "Bootstrap: admin login synced from env (password reset on boot)");
    } else if ((await prisma.admin.count()) === 0) {
      await prisma.admin.create({
        data: { email: "admin@demo.local", name: "Admin", passwordHash: hash("changeme") },
      });
      logger.info("Bootstrap: created default admin (admin@demo.local / changeme)");
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
