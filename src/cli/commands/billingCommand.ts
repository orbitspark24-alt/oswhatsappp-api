import { Command } from "commander";
import { registerTool, Tool } from "../../modules/Tool";
import { PlanService } from "../../services/PlanService";
import { SubscriptionService } from "../../services/SubscriptionService";
import { BillingService } from "../../services/BillingService";
import { UsageService } from "../../services/UsageService";
import { ui, runAction } from "../ui";

function money(cents: number, currency = "USD"): string {
  return `${(cents / 100).toFixed(2)} ${currency}`;
}

const billingTool: Tool = {
  name: "billing",
  description: "Plans, subscriptions, invoices, payments, and usage",

  register(program: Command) {
    const group = program.command("billing").description(this.description);

    // ---- Plans ----
    const plan = group.command("plan").description("Manage subscription plans");

    plan
      .command("create")
      .description("Create a plan")
      .requiredOption("--name <name>")
      .requiredOption("--price <amount>", "Monthly price in major units, e.g. 49.00")
      .requiredOption("--quota <messages>", "Monthly message quota")
      .option("--currency <code>", "Currency code", "USD")
      .option("--rate-limit <perSecond>", "Messages per second", "10")
      .option("--max-accounts <n>", "Max WhatsApp accounts", "1")
      .option("--feature-flags <json>", "Feature flags as JSON", "{}")
      .action(
        runAction(async (opts) => {
          const created = await PlanService.create({
            name: opts.name,
            priceCents: Math.round(Number(opts.price) * 100),
            currency: opts.currency,
            messageQuota: Number(opts.quota),
            rateLimitPerSecond: Number(opts.rateLimit),
            maxWhatsAppAccounts: Number(opts.maxAccounts),
            featureFlags: JSON.parse(opts.featureFlags),
          });
          ui.success(`Created plan ${created.name} (${created.id})`);
        })
      );

    plan
      .command("list")
      .description("List plans")
      .action(
        runAction(async () => {
          const plans = await PlanService.list();
          ui.heading(`Plans (${plans.length})`);
          ui.table(
            plans.map((p) => ({
              Name: p.name,
              Price: money(p.priceCents, p.currency),
              Quota: p.messageQuota,
              "Rate/s": p.rateLimitPerSecond,
              MaxAcc: p.maxWhatsAppAccounts,
              Active: p.active,
            })),
            ["Name", "Price", "Quota", "Rate/s", "MaxAcc", "Active"]
          );
        })
      );

    // ---- Subscriptions ----
    const sub = group.command("subscription").description("Manage client subscriptions");

    sub
      .command("create")
      .description("Subscribe a client to a plan")
      .requiredOption("--client <clientId>")
      .requiredOption("--plan <idOrName>")
      .option("--account <whatsappAccountId>", "Account this subscription meters")
      .option("--no-invoice", "Skip generating the first invoice")
      .action(
        runAction(async (opts) => {
          const created = await SubscriptionService.create({
            clientId: opts.client,
            plan: opts.plan,
            whatsappAccountId: opts.account,
            generateFirstInvoice: opts.invoice !== false,
          });
          ui.success(`Created subscription ${created!.id}`);
          ui.keyValue({
            ID: created!.id,
            Client: created!.client.name,
            Plan: created!.plan.name,
            Status: created!.status,
            Renewal: created!.renewalDate,
          });
        })
      );

    sub
      .command("list")
      .description("List subscriptions")
      .option("--client <clientId>")
      .option("--status <status>")
      .action(
        runAction(async (opts) => {
          const subs = await SubscriptionService.list({ clientId: opts.client, status: opts.status });
          ui.heading(`Subscriptions (${subs.length})`);
          ui.table(
            subs.map((s) => ({
              ID: s.id,
              Client: (s as { client?: { name: string } }).client?.name,
              Plan: (s as { plan?: { name: string } }).plan?.name,
              Status: s.status,
              Renewal: s.renewalDate,
            })),
            ["ID", "Client", "Plan", "Status", "Renewal"]
          );
        })
      );

    sub
      .command("cancel <subscriptionId>")
      .description("Cancel a subscription")
      .action(
        runAction(async (id) => {
          await SubscriptionService.cancel(id);
          ui.success(`Subscription ${id} cancelled`);
        })
      );

    // ---- Invoices & payments ----
    const invoice = group.command("invoice").description("Invoices and payments");

    invoice
      .command("list")
      .description("List invoices")
      .option("--client <clientId>")
      .option("--status <status>")
      .action(
        runAction(async (opts) => {
          const invoices = await BillingService.listInvoices({ clientId: opts.client, status: opts.status });
          ui.heading(`Invoices (${invoices.length})`);
          ui.table(
            invoices.map((i) => ({
              ID: i.id,
              Client: (i as { client?: { name: string } }).client?.name,
              Amount: money(i.amountCents, i.currency),
              Status: i.status,
              Due: i.dueAt,
            })),
            ["ID", "Client", "Amount", "Status", "Due"]
          );
        })
      );

    invoice
      .command("pay <invoiceId>")
      .description("Record a payment for an invoice")
      .option("--provider <key>", "Payment provider", "manual")
      .option("--reference <note>", "Payment reference/note")
      .action(
        runAction(async (id, opts) => {
          const paid = await BillingService.payInvoice(id, { provider: opts.provider, reference: opts.reference });
          ui.success(`Invoice ${id} marked PAID (${money(paid!.amountCents, paid!.currency)})`);
        })
      );

    // ---- Billing cycle / enforcement ----
    group
      .command("run-cycle")
      .description("Generate invoices for all subscriptions due for renewal")
      .action(
        runAction(async () => {
          const results = await BillingService.runBillingCycle();
          ui.success(`Billing cycle complete — ${results.length} invoice(s) generated`);
          if (results.length) ui.table(results, ["subscriptionId", "invoiceId"]);
        })
      );

    group
      .command("enforce")
      .description("Mark overdue invoices and auto-suspend non-paying subscriptions")
      .option("--grace-days <n>", "Grace period after due date", "7")
      .action(
        runAction(async (opts) => {
          const actions = await BillingService.enforceOverdue(new Date(), Number(opts.graceDays));
          ui.success(`Enforcement complete — ${actions.length} action(s)`);
          if (actions.length) ui.table(actions, ["invoiceId", "action"]);
        })
      );

    // ---- Usage ----
    group
      .command("usage <accountId>")
      .description("Show quota/usage for an account's current cycle")
      .action(
        runAction(async (accountId) => {
          const status = await UsageService.getQuotaStatus(accountId);
          ui.heading(`Usage — account ${accountId}`);
          ui.keyValue({
            Used: status.used,
            Quota: status.quota,
            Remaining: status.remaining,
            Overage: status.overage,
            SendingAllowed: status.allowed,
            CycleStart: status.cycleStart,
            CycleEnd: status.cycleEnd,
          });
        })
      );
  },
};

registerTool(billingTool);
export default billingTool;
