import { MessageRepository } from "../repositories/MessageRepository";
import { AccountService } from "./AccountService";
import { UsageService } from "./UsageService";
import { getWhatsAppProvider, WhatsAppMessageType } from "../providers/whatsapp";
import { audit } from "../lib/audit";
import { ServiceError } from "./errors";

export interface SendInput {
  to: string;
  type: WhatsAppMessageType;
  content: Record<string, unknown>;
  templateId?: string;
}

export const MessageService = {
  // Send any message type through the account's provider, enforce quota, persist to the
  // conversation log, and meter usage. Shared by the CLI and the REST API.
  async send(accountId: string, input: SendInput) {
    const account = await AccountService.getById(accountId);
    if (account.status !== "ACTIVE") {
      throw new ServiceError(`Account ${accountId} is ${account.status}; cannot send.`, 409);
    }

    // Quota enforcement is best-effort: only block when a metering subscription exists and
    // its (hard) quota disallows the send. Accounts without a subscription are not blocked.
    try {
      const quota = await UsageService.getQuotaStatus(accountId);
      if (!quota.allowed) {
        throw new ServiceError(
          `Message quota exceeded (${quota.used}/${quota.quota}) for the current cycle.`,
          429
        );
      }
    } catch (err) {
      if (err instanceof ServiceError && err.statusCode === 429) throw err;
      // No subscription / quota lookup failed — proceed without blocking.
    }

    const provider = getWhatsAppProvider(account.provider);
    const credentials = AccountService.getDecryptedCredentials(account);

    const result = await provider.sendMessage(credentials, {
      to: input.to,
      type: input.type,
      content: input.content,
    });

    const message = await MessageRepository.create({
      whatsappAccount: { connect: { id: accountId } },
      direction: "OUTBOUND",
      waMessageId: result.providerMessageId,
      fromNumber: account.displayPhoneNumber ?? account.phoneNumberId,
      toNumber: input.to,
      type: input.type,
      contentJson: JSON.stringify(input.content),
      status: result.success ? "SENT" : "FAILED",
      template: input.templateId ? { connect: { id: input.templateId } } : undefined,
    });

    if (result.success) {
      await UsageService.recordMessage(accountId, "OUTBOUND");
    }

    await audit({
      actorType: "admin",
      action: "message.send",
      targetType: "message",
      targetId: message.id,
      metadata: { accountId, type: input.type, success: result.success },
    });

    if (!result.success) {
      throw new ServiceError(`Send failed: ${result.error ?? "unknown error"}`);
    }
    return message;
  },

  sendText(accountId: string, to: string, body: string, previewUrl = false) {
    return MessageService.send(accountId, {
      to,
      type: "text",
      content: { preview_url: previewUrl, body },
    });
  },

  // Conversation log query.
  list(accountId: string, params?: { contact?: string; take?: number }) {
    return MessageRepository.list({ whatsappAccountId: accountId, ...params });
  },
};
