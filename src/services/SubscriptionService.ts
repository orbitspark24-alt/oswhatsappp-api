import { z } from "zod";
import { SubscriptionRepository } from "../repositories/SubscriptionRepository";
import { WhatsAppAccountRepository } from "../repositories/WhatsAppAccountRepository";
import { ClientService } from "./ClientService";
import { PlanService } from "./PlanService";
import { BillingService } from "./BillingService";
import { addMonths } from "../lib/billingDates";
import { audit } from "../lib/audit";
import { ConflictError, NotFoundError, ValidationError } from "./errors";

export const CreateSubscriptionInput = z.object({
  clientId: z.string().min(1),
  plan: z.string().min(1), // plan id or name
  whatsappAccountId: z.string().optional(),
  generateFirstInvoice: z.boolean().default(true),
});
export type CreateSubscriptionInput = z.infer<typeof CreateSubscriptionInput>;

export const SubscriptionService = {
  async create(input: CreateSubscriptionInput) {
    const data = CreateSubscriptionInput.parse(input);
    await ClientService.getById(data.clientId);
    const plan = await PlanService.resolve(data.plan);

    // Enforce the plan's account ceiling.
    const accountCount = await WhatsAppAccountRepository.countByClient(data.clientId);
    if (accountCount > plan.maxWhatsAppAccounts) {
      throw new ConflictError(
        `Client has ${accountCount} accounts but plan "${plan.name}" allows ${plan.maxWhatsAppAccounts}.`
      );
    }

    if (data.whatsappAccountId) {
      const account = await WhatsAppAccountRepository.findById(data.whatsappAccountId);
      if (!account) throw new NotFoundError(`WhatsApp account ${data.whatsappAccountId} not found.`);
      if (account.clientId !== data.clientId) {
        throw new ValidationError("WhatsApp account does not belong to this client.");
      }
    }

    const startDate = new Date();
    const subscription = await SubscriptionRepository.create({
      client: { connect: { id: data.clientId } },
      plan: { connect: { id: plan.id } },
      whatsappAccount: data.whatsappAccountId
        ? { connect: { id: data.whatsappAccountId } }
        : undefined,
      status: "ACTIVE",
      startDate,
      renewalDate: addMonths(startDate, 1),
    });

    await audit({
      actorType: "admin",
      action: "subscription.create",
      targetType: "subscription",
      targetId: subscription.id,
      metadata: { clientId: data.clientId, plan: plan.name },
    });

    if (data.generateFirstInvoice) {
      await BillingService.generateInvoice(subscription.id);
    }

    return SubscriptionRepository.findById(subscription.id);
  },

  async getById(id: string) {
    const sub = await SubscriptionRepository.findById(id);
    if (!sub) throw new NotFoundError(`Subscription ${id} not found.`);
    return sub;
  },

  list(params?: { clientId?: string; status?: string }) {
    return SubscriptionRepository.list(params);
  },

  async cancel(id: string) {
    await SubscriptionService.getById(id);
    const sub = await SubscriptionRepository.update(id, {
      status: "CANCELLED",
      cancelledAt: new Date(),
    });
    await audit({
      actorType: "admin",
      action: "subscription.cancel",
      targetType: "subscription",
      targetId: id,
    });
    return sub;
  },
};
