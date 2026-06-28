import { randomUUID } from "crypto";
import { logger } from "../../lib/logger";
import {
  WhatsAppProvider,
  WhatsAppAccountCredentials,
  SendMessageParams,
  SendTextMessageParams,
  SendMessageResult,
  HealthCheckResult,
  TemplateDefinition,
  CreateTemplateResult,
  RemoteTemplate,
} from "./WhatsAppProvider.interface";

// In-memory provider for offline development and tests — never calls Meta.
// Default provider for newly provisioned accounts until real Cloud API credentials are supplied.
export class MockProvider implements WhatsAppProvider {
  readonly name = "mock";

  async sendMessage(
    credentials: WhatsAppAccountCredentials,
    params: SendMessageParams
  ): Promise<SendMessageResult> {
    const providerMessageId = `mock-wamid.${randomUUID()}`;
    logger.info(
      { phoneNumberId: credentials.phoneNumberId, to: params.to, type: params.type, providerMessageId },
      `MockProvider: simulated ${params.type} send`
    );
    return { success: true, providerMessageId, raw: { simulated: true } };
  }

  sendTextMessage(
    credentials: WhatsAppAccountCredentials,
    params: SendTextMessageParams
  ): Promise<SendMessageResult> {
    return this.sendMessage(credentials, { to: params.to, type: "text", content: { body: params.body } });
  }

  async healthCheck(credentials: WhatsAppAccountCredentials): Promise<HealthCheckResult> {
    return {
      healthy: true,
      displayPhoneNumber: `+1-mock-${credentials.phoneNumberId.slice(-4)}`,
      verifiedName: "Mock Business",
      qualityRating: "GREEN",
    };
  }

  async createTemplate(
    _credentials: WhatsAppAccountCredentials,
    _def: TemplateDefinition
  ): Promise<CreateTemplateResult> {
    return { success: true, metaTemplateId: `mock-tpl-${randomUUID()}`, status: "PENDING" };
  }

  async listTemplates(
    _credentials: WhatsAppAccountCredentials
  ): Promise<{ templates: RemoteTemplate[]; error?: string }> {
    // Mock approves everything so the local approval flow can be exercised.
    return { templates: [] };
  }
}
