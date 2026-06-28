import { z } from "zod";
import { WhatsAppAccountRepository } from "../repositories/WhatsAppAccountRepository";
import { ClientService } from "./ClientService";
import { WhatsAppProviderType } from "../types/enums";
import { getWhatsAppProvider, WhatsAppAccountCredentials } from "../providers/whatsapp";
import { encrypt, decrypt } from "../lib/crypto";
import { config } from "../config";
import { audit } from "../lib/audit";
import { ConflictError, NotFoundError, ServiceError } from "./errors";

export const ProvisionAccountInput = z.object({
  clientId: z.string().min(1),
  wabaId: z.string().min(1),
  phoneNumberId: z.string().min(1),
  accessToken: z.string().min(1),
  provider: WhatsAppProviderType.default("CLOUD_API"),
  webhookVerifyToken: z.string().optional(),
  appSecret: z.string().optional(),
});
export type ProvisionAccountInput = z.infer<typeof ProvisionAccountInput>;

// Decrypts an account's stored secrets into the plaintext shape providers expect.
// Kept internal — plaintext credentials never leave this module except into a provider call.
function decryptCredentials(account: {
  wabaId: string;
  phoneNumberId: string;
  accessTokenEncrypted: string;
  appSecretEncrypted: string | null;
}): WhatsAppAccountCredentials {
  return {
    wabaId: account.wabaId,
    phoneNumberId: account.phoneNumberId,
    accessToken: decrypt(account.accessTokenEncrypted),
    appSecret: account.appSecretEncrypted ? decrypt(account.appSecretEncrypted) : undefined,
  };
}

export const AccountService = {
  // Onboard a new WhatsApp account under a client. Secrets are encrypted at rest here.
  async provision(input: ProvisionAccountInput) {
    const data = ProvisionAccountInput.parse(input);

    await ClientService.getById(data.clientId); // 404s if client missing

    const existing = await WhatsAppAccountRepository.findByPhoneNumberId(data.phoneNumberId);
    if (existing) {
      throw new ConflictError(`Phone number ID ${data.phoneNumberId} is already provisioned.`);
    }

    const verifyToken = data.webhookVerifyToken ?? config.meta.defaultWebhookVerifyToken;
    if (!verifyToken) {
      throw new ServiceError(
        "No webhook verify token supplied and META_WEBHOOK_VERIFY_TOKEN_DEFAULT is unset."
      );
    }

    const account = await WhatsAppAccountRepository.create({
      client: { connect: { id: data.clientId } },
      provider: data.provider,
      wabaId: data.wabaId,
      phoneNumberId: data.phoneNumberId,
      accessTokenEncrypted: encrypt(data.accessToken),
      webhookVerifyTokenEncrypted: encrypt(verifyToken),
      appSecretEncrypted: data.appSecret ? encrypt(data.appSecret) : null,
      status: "PENDING",
    });

    await audit({
      actorType: "admin",
      action: "account.provision",
      targetType: "whatsapp_account",
      targetId: account.id,
      metadata: { clientId: data.clientId, provider: data.provider, phoneNumberId: data.phoneNumberId },
    });

    return account;
  },

  async getById(id: string) {
    const account = await WhatsAppAccountRepository.findById(id);
    if (!account) throw new NotFoundError(`WhatsApp account ${id} not found.`);
    return account;
  },

  list(params?: { clientId?: string; status?: string }) {
    return WhatsAppAccountRepository.list(params);
  },

  // Ping Meta (or mock) to confirm the number is live and the token valid; persists result.
  async healthCheck(id: string) {
    const account = await AccountService.getById(id);
    const provider = getWhatsAppProvider(account.provider);
    const result = await provider.healthCheck(decryptCredentials(account));

    const updated = await WhatsAppAccountRepository.update(id, {
      healthStatus: result.healthy ? "HEALTHY" : "UNHEALTHY",
      lastHealthCheckAt: new Date(),
      displayPhoneNumber: result.displayPhoneNumber ?? account.displayPhoneNumber,
      verifiedName: result.verifiedName ?? account.verifiedName,
      // First successful health check promotes a PENDING account to ACTIVE.
      status: result.healthy && account.status === "PENDING" ? "ACTIVE" : account.status,
    });

    await audit({
      actorType: "admin",
      action: "account.health_check",
      targetType: "whatsapp_account",
      targetId: id,
      metadata: { healthy: result.healthy, error: result.error },
    });

    return { account: updated, result };
  },

  async setStatus(id: string, status: "ACTIVE" | "SUSPENDED" | "DEPROVISIONED") {
    await AccountService.getById(id);
    const account = await WhatsAppAccountRepository.update(id, { status });
    await audit({
      actorType: "admin",
      action: `account.${status.toLowerCase()}`,
      targetType: "whatsapp_account",
      targetId: id,
    });
    return account;
  },

  suspend(id: string) {
    return AccountService.setStatus(id, "SUSPENDED");
  },
  resume(id: string) {
    return AccountService.setStatus(id, "ACTIVE");
  },
  deprovision(id: string) {
    return AccountService.setStatus(id, "DEPROVISIONED");
  },

  // Exposed for the messaging module (step 5) so it doesn't re-implement decryption.
  getDecryptedCredentials: decryptCredentials,
};
