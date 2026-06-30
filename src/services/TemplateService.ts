import { z } from "zod";
import { TemplateRepository } from "../repositories/TemplateRepository";
import { AccountService } from "./AccountService";
import { MessageService } from "./MessageService";
import { getWhatsAppProvider } from "../providers/whatsapp";
import { audit } from "../lib/audit";
import { ConflictError, NotFoundError, ServiceError } from "./errors";

export const CreateTemplateInput = z.object({
  accountId: z.string().min(1),
  name: z.string().min(1),
  language: z.string().min(1),
  category: z.enum(["MARKETING", "UTILITY", "AUTHENTICATION"]),
  components: z.array(z.unknown()),
});
export type CreateTemplateInput = z.infer<typeof CreateTemplateInput>;

export const TemplateService = {
  // Create a template locally and submit it to Meta for approval.
  async create(input: CreateTemplateInput) {
    const data = CreateTemplateInput.parse(input);
    const account = await AccountService.getById(data.accountId);

    if (await TemplateRepository.findByName(data.accountId, data.name, data.language)) {
      throw new ConflictError(`Template ${data.name}/${data.language} already exists for this account.`);
    }

    const provider = getWhatsAppProvider(account.provider);
    const credentials = AccountService.getDecryptedCredentials(account);
    const submission = await provider.createTemplate(credentials, {
      name: data.name,
      language: data.language,
      category: data.category,
      components: data.components,
    });

    if (!submission.success) {
      throw new ServiceError(`Template submission failed: ${submission.error ?? "unknown error"}`);
    }

    const template = await TemplateRepository.create({
      whatsappAccount: { connect: { id: data.accountId } },
      name: data.name,
      language: data.language,
      category: data.category,
      status: submission.status ?? "PENDING",
      bodyJson: JSON.stringify(data.components),
      metaTemplateId: submission.metaTemplateId,
    });

    await audit({
      actorType: "admin",
      action: "template.create",
      targetType: "template",
      targetId: template.id,
      metadata: { accountId: data.accountId, name: data.name },
    });
    return template;
  },

  list(accountId: string) {
    return TemplateRepository.list(accountId);
  },

  // Test affordance: approve a template locally so the send/broadcast flow can be exercised
  // on MOCK accounts. Real (CLOUD_API) templates are approved by Meta — use syncStatuses().
  async manualApprove(id: string) {
    const template = await TemplateService.getById(id);
    const account = await AccountService.getById(template.whatsappAccountId);
    if (account.provider !== "MOCK") {
      throw new ServiceError(
        "Only MOCK-account templates can be approved manually; real templates are approved by Meta (use Sync).",
        409
      );
    }
    return TemplateRepository.update(id, { status: "APPROVED" });
  },

  async getById(id: string) {
    const t = await TemplateRepository.findById(id);
    if (!t) throw new NotFoundError(`Template ${id} not found.`);
    return t;
  },

  // Pull templates from Meta: reconcile statuses of known templates AND import any that
  // exist on the WABA but not yet locally (e.g. the pre-approved hello_world template), so
  // they become sendable from the console/UI.
  async syncStatuses(accountId: string) {
    const account = await AccountService.getById(accountId);
    const provider = getWhatsAppProvider(account.provider);
    const credentials = AccountService.getDecryptedCredentials(account);
    const { templates, error } = await provider.listTemplates(credentials);
    if (error) throw new ServiceError(`Failed to fetch templates: ${error}`);

    let updated = 0;
    let imported = 0;
    for (const remote of templates) {
      const local = await TemplateRepository.findByName(accountId, remote.name, remote.language);
      if (!local) {
        // Import. Body components aren't returned by the list call, so store an empty set —
        // variable-less templates (like hello_world) send fine; re-create locally to add vars.
        await TemplateRepository.create({
          whatsappAccount: { connect: { id: accountId } },
          name: remote.name,
          language: remote.language,
          category: remote.category ?? "UTILITY",
          status: remote.status,
          bodyJson: "[]",
          metaTemplateId: remote.metaTemplateId,
        });
        imported++;
      } else if (local.status !== remote.status) {
        await TemplateRepository.update(local.id, {
          status: remote.status,
          metaTemplateId: remote.metaTemplateId ?? local.metaTemplateId,
        });
        updated++;
      }
    }
    return { fetched: templates.length, updated, imported };
  },

  // Send an approved template message, substituting body variables in order.
  async send(templateId: string, to: string, variables: string[] = []) {
    const template = await TemplateService.getById(templateId);
    if (template.status !== "APPROVED") {
      throw new ServiceError(`Template ${template.name} is ${template.status}, not APPROVED.`, 409);
    }

    const components =
      variables.length > 0
        ? [{ type: "body", parameters: variables.map((v) => ({ type: "text", text: v })) }]
        : [];

    return MessageService.send(template.whatsappAccountId, {
      to,
      type: "template",
      content: {
        name: template.name,
        language: { code: template.language },
        components,
      },
      templateId: template.id,
    });
  },
};
