import { SubscriptionRepository } from "../repositories/SubscriptionRepository";
import { InvoiceRepository } from "../repositories/InvoiceRepository";
import { PaymentRepository } from "../repositories/PaymentRepository";
import { AccountService } from "./AccountService";
import { getPaymentProvider } from "../providers/payment";
import { addMonths, currentPeriod, Period } from "../lib/billingDates";
import { audit } from "../lib/audit";
import { NotFoundError, ServiceError, ConflictError } from "./errors";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_GRACE_DAYS = 7;

export const BillingService = {
  // Creates an ISSUED invoice for a subscription's billing period, unless one already exists.
  async generateInvoice(subscriptionId: string, period?: Period) {
    const subscription = await SubscriptionRepository.findById(subscriptionId);
    if (!subscription) throw new NotFoundError(`Subscription ${subscriptionId} not found.`);

    const p = period ?? currentPeriod(subscription.startDate);

    const existing = await InvoiceRepository.findBySubscriptionAndPeriod(subscriptionId, p.start);
    if (existing) return existing;

    const invoice = await InvoiceRepository.create({
      subscription: { connect: { id: subscriptionId } },
      client: { connect: { id: subscription.clientId } },
      periodStart: p.start,
      periodEnd: p.end,
      amountCents: subscription.plan.priceCents,
      currency: subscription.plan.currency,
      status: "ISSUED",
      issuedAt: new Date(),
      dueAt: p.end,
    });

    await audit({
      actorType: "system",
      action: "invoice.create",
      targetType: "invoice",
      targetId: invoice.id,
      metadata: { subscriptionId, amountCents: invoice.amountCents, periodStart: p.start },
    });
    return invoice;
  },

  // Monthly billing run: invoice every subscription whose renewal is due, then advance renewal.
  async runBillingCycle(asOf: Date = new Date()) {
    const due = await SubscriptionRepository.findDueForRenewal(asOf);
    const results: Array<{ subscriptionId: string; invoiceId: string }> = [];

    for (const sub of due) {
      // The period that begins at the current renewal date.
      const period: Period = {
        start: sub.renewalDate,
        end: addMonths(sub.renewalDate, 1),
        index: -1,
      };
      const invoice = await this.generateInvoice(sub.id, period);
      await SubscriptionRepository.update(sub.id, { renewalDate: period.end });
      results.push({ subscriptionId: sub.id, invoiceId: invoice.id });
    }
    return results;
  },

  // Record a payment against an invoice via a PaymentProvider (default: manual/offline).
  async payInvoice(invoiceId: string, opts?: { provider?: string; reference?: string }) {
    const invoice = await InvoiceRepository.findById(invoiceId);
    if (!invoice) throw new NotFoundError(`Invoice ${invoiceId} not found.`);
    if (invoice.status === "PAID") throw new ConflictError("Invoice is already paid.");
    if (invoice.status === "VOID") throw new ServiceError("Cannot pay a voided invoice.");

    const providerKey = opts?.provider ?? "manual";
    const provider = getPaymentProvider(providerKey);
    const result = await provider.charge({
      invoiceId,
      amountCents: invoice.amountCents,
      currency: invoice.currency,
      reference: opts?.reference,
    });

    await PaymentRepository.create({
      invoice: { connect: { id: invoiceId } },
      amountCents: invoice.amountCents,
      currency: invoice.currency,
      method: providerKey,
      provider: provider.name,
      status: result.status,
      reference: result.reference,
      paidAt: result.success ? new Date() : null,
    });

    if (!result.success) {
      throw new ServiceError(`Payment failed: ${result.error ?? "unknown error"}`);
    }

    await InvoiceRepository.update(invoiceId, { status: "PAID", paidAt: new Date() });

    // A successful payment clears a past-due/suspended subscription and resumes its account.
    const sub = invoice.subscription;
    if (sub && (sub.status === "PAST_DUE" || sub.status === "SUSPENDED")) {
      await SubscriptionRepository.update(sub.id, { status: "ACTIVE" });
      if (sub.whatsappAccountId) {
        await AccountService.resume(sub.whatsappAccountId).catch(() => undefined);
      }
    }

    await audit({
      actorType: "admin",
      action: "invoice.pay",
      targetType: "invoice",
      targetId: invoiceId,
      metadata: { provider: providerKey, amountCents: invoice.amountCents },
    });
    return InvoiceRepository.findById(invoiceId);
  },

  // Enforcement run: mark overdue invoices, flag subscriptions past-due, and auto-suspend
  // (subscription + account) once the grace period after the due date has elapsed.
  async enforceOverdue(asOf: Date = new Date(), graceDays = DEFAULT_GRACE_DAYS) {
    const overdue = await InvoiceRepository.findOverdue(asOf);
    const actions: Array<{ invoiceId: string; action: string }> = [];

    for (const invoice of overdue) {
      if (invoice.status === "ISSUED") {
        await InvoiceRepository.update(invoice.id, { status: "OVERDUE" });
        actions.push({ invoiceId: invoice.id, action: "marked_overdue" });
      }

      const sub = invoice.subscription;
      if (!sub) continue;

      const dueAt = invoice.dueAt ?? invoice.periodEnd;
      const graceExpired = asOf.getTime() > dueAt.getTime() + graceDays * MS_PER_DAY;

      if (graceExpired) {
        if (sub.status !== "SUSPENDED") {
          await SubscriptionRepository.update(sub.id, { status: "SUSPENDED" });
          if (sub.whatsappAccountId) {
            await AccountService.suspend(sub.whatsappAccountId).catch(() => undefined);
          }
          actions.push({ invoiceId: invoice.id, action: "subscription_suspended" });
          await audit({
            actorType: "system",
            action: "subscription.suspend",
            targetType: "subscription",
            targetId: sub.id,
            metadata: { reason: "non_payment", invoiceId: invoice.id },
          });
        }
      } else if (sub.status === "ACTIVE") {
        await SubscriptionRepository.update(sub.id, { status: "PAST_DUE" });
        actions.push({ invoiceId: invoice.id, action: "subscription_past_due" });
      }
    }
    return actions;
  },

  getInvoice(id: string) {
    return InvoiceRepository.findById(id);
  },
  listInvoices(params?: { clientId?: string; status?: string }) {
    return InvoiceRepository.list(params);
  },
};
