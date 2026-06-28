import { z } from "zod";
import { PlanRepository } from "../repositories/PlanRepository";
import { audit } from "../lib/audit";
import { ConflictError, NotFoundError } from "./errors";

export const CreatePlanInput = z.object({
  name: z.string().min(1),
  priceCents: z.number().int().nonnegative(),
  currency: z.string().default("USD"),
  messageQuota: z.number().int().nonnegative(),
  rateLimitPerSecond: z.number().int().positive().default(10),
  maxWhatsAppAccounts: z.number().int().positive().default(1),
  featureFlags: z.record(z.unknown()).default({}),
});
export type CreatePlanInput = z.infer<typeof CreatePlanInput>;

export const PlanService = {
  async create(input: CreatePlanInput) {
    const data = CreatePlanInput.parse(input);
    if (await PlanRepository.findByName(data.name)) {
      throw new ConflictError(`Plan "${data.name}" already exists.`);
    }
    const plan = await PlanRepository.create({
      name: data.name,
      priceCents: data.priceCents,
      currency: data.currency,
      messageQuota: data.messageQuota,
      rateLimitPerSecond: data.rateLimitPerSecond,
      maxWhatsAppAccounts: data.maxWhatsAppAccounts,
      featureFlagsJson: JSON.stringify(data.featureFlags),
    });
    await audit({ actorType: "admin", action: "plan.create", targetType: "plan", targetId: plan.id });
    return plan;
  },

  async getById(id: string) {
    const plan = await PlanRepository.findById(id);
    if (!plan) throw new NotFoundError(`Plan ${id} not found.`);
    return plan;
  },

  // Accepts a plan id or a unique plan name for convenience in the CLI.
  async resolve(idOrName: string) {
    const byId = await PlanRepository.findById(idOrName);
    if (byId) return byId;
    const byName = await PlanRepository.findByName(idOrName);
    if (byName) return byName;
    throw new NotFoundError(`Plan "${idOrName}" not found (by id or name).`);
  },

  list(params?: { activeOnly?: boolean }) {
    return PlanRepository.list(params);
  },

  featureFlags(plan: { featureFlagsJson: string }): Record<string, unknown> {
    try {
      return JSON.parse(plan.featureFlagsJson);
    } catch {
      return {};
    }
  },
};
