import { describe, it, expect, beforeAll } from "vitest";
import { ClientService } from "../../src/services/ClientService";
import { AccountService } from "../../src/services/AccountService";
import { PlanService } from "../../src/services/PlanService";
import { SubscriptionService } from "../../src/services/SubscriptionService";
import { BillingService } from "../../src/services/BillingService";
import { UsageService } from "../../src/services/UsageService";
import { MessageService } from "../../src/services/MessageService";
import { prisma } from "../../src/db/prisma";

// Exercises the core provisioning -> billing -> messaging flow against the test DB.
describe("service flow (integration)", () => {
  let clientId: string;
  let accountId: string;

  beforeAll(async () => {
    const client = await ClientService.create({ name: "Test Co", email: `flow${Date.now()}@t.local` });
    clientId = client.id;
    const account = await AccountService.provision({
      clientId,
      wabaId: "w-int",
      phoneNumberId: `pn-int-${Date.now()}`,
      accessToken: "secret-token",
      provider: "MOCK",
      webhookVerifyToken: "vt",
    });
    accountId = account.id;
  });

  it("provisions an account as PENDING and stores the token encrypted (not plaintext)", async () => {
    const row = await prisma.whatsAppAccount.findUniqueOrThrow({ where: { id: accountId } });
    expect(row.status).toBe("PENDING");
    expect(row.accessTokenEncrypted).not.toContain("secret-token");
  });

  it("health-check activates the account", async () => {
    const { account, result } = await AccountService.healthCheck(accountId);
    expect(result.healthy).toBe(true);
    expect(account.status).toBe("ACTIVE");
  });

  it("subscribes to a plan and auto-generates the first invoice", async () => {
    const plan = await PlanService.create({ name: `Plan-${Date.now()}`, priceCents: 4900, messageQuota: 5 });
    await SubscriptionService.create({ clientId, plan: plan.id, whatsappAccountId: accountId });
    const invoices = await BillingService.listInvoices({ clientId });
    expect(invoices.length).toBe(1);
    expect(invoices[0].status).toBe("ISSUED");
  });

  it("meters outbound messages against the quota", async () => {
    await MessageService.sendText(accountId, "15551230000", "hi");
    const status = await UsageService.getQuotaStatus(accountId);
    expect(status.used).toBeGreaterThanOrEqual(1);
    expect(status.quota).toBe(5);
  });

  it("pays an invoice and marks it PAID", async () => {
    const invoices = await BillingService.listInvoices({ clientId });
    const paid = await BillingService.payInvoice(invoices[0].id, { reference: "test" });
    expect(paid!.status).toBe("PAID");
  });

  it("blocks provisioning a duplicate phone number id", async () => {
    const row = await prisma.whatsAppAccount.findUniqueOrThrow({ where: { id: accountId } });
    await expect(
      AccountService.provision({
        clientId,
        wabaId: "w2",
        phoneNumberId: row.phoneNumberId,
        accessToken: "t",
        provider: "MOCK",
        webhookVerifyToken: "vt",
      })
    ).rejects.toThrow();
  });
});
