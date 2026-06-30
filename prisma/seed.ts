import { createHash, randomBytes } from "crypto";
import { PrismaClient } from "@prisma/client";

// Seeds a demo admin, the three default plans, and a mock client with a MOCK WhatsApp account.
// Idempotent: re-running upserts by unique keys instead of duplicating.
const prisma = new PrismaClient();

// Lightweight password hash for the seeded demo admin only. Real admin auth (step 6+) should
// use a proper KDF (bcrypt/argon2); this avoids adding a dependency just for seed data.
function demoHash(input: string): string {
  return "sha256$" + createHash("sha256").update(input).digest("hex");
}

async function main() {
  const admin = await prisma.admin.upsert({
    where: { email: "admin@demo.local" },
    update: {},
    create: {
      email: "admin@demo.local",
      name: "Demo Admin",
      passwordHash: demoHash("changeme"),
    },
  });
  console.log(`Admin: ${admin.email} (password: changeme)`);

  const plans = [
    { name: "Starter", priceCents: 1900, messageQuota: 1000, rateLimitPerSecond: 5, maxWhatsAppAccounts: 1 },
    { name: "Pro", priceCents: 4900, messageQuota: 10000, rateLimitPerSecond: 20, maxWhatsAppAccounts: 3 },
    { name: "Business", priceCents: 9900, messageQuota: 50000, rateLimitPerSecond: 80, maxWhatsAppAccounts: 10 },
  ];
  for (const p of plans) {
    await prisma.plan.upsert({
      where: { name: p.name },
      update: {},
      create: { ...p, currency: "USD", featureFlagsJson: "{}" },
    });
  }
  console.log(`Plans: ${plans.map((p) => p.name).join(", ")}`);

  // Demo client with a portal login (the customer-facing app): demo@client.local / client123
  const portalHash = demoHash("client123");
  const client = await prisma.client.upsert({
    where: { email: "demo@client.local" },
    update: { portalPasswordHash: portalHash },
    create: { name: "Demo Client", companyName: "Demo Co", email: "demo@client.local", status: "ACTIVE", portalPasswordHash: portalHash },
  });
  console.log(`Client: ${client.name} (${client.id}) — portal login: demo@client.local / client123`);

  // A demo public API key for the client (plaintext shown once here for local testing).
  const existingKey = await prisma.apiKey.findFirst({ where: { clientId: client.id } });
  if (!existingKey) {
    const secret = "wac_test_" + randomBytes(16).toString("hex");
    await prisma.apiKey.create({
      data: {
        clientId: client.id,
        prefix: secret.slice(0, 12),
        keyHash: createHash("sha256").update(secret).digest("hex"),
      },
    });
    console.log(`Demo API key (save it, shown once): ${secret}`);
  }

  console.log("\nSeed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
