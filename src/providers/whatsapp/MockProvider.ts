import { randomUUID } from "crypto";
import { logger } from "../../lib/logger";
import {
  WhatsAppProvider,
  WhatsAppAccountCredentials,
  SendTextMessageParams,
  SendMessageResult,
  HealthCheckResult,
} from "./WhatsAppProvider.interface";

// In-memory provider for offline development and tests — never calls Meta.
// Default provider for newly provisioned accounts until real Cloud API credentials are supplied.
export class MockProvider implements WhatsAppProvider {
  readonly name = "mock";

  async sendTextMessage(
    credentials: WhatsAppAccountCredentials,
    params: SendTextMessageParams
  ): Promise<SendMessageResult> {
    const providerMessageId = `mock-wamid.${randomUUID()}`;
    logger.info(
      { phoneNumberId: credentials.phoneNumberId, to: params.to, providerMessageId },
      `MockProvider: simulated send "${params.body}"`
    );
    return { success: true, providerMessageId, raw: { simulated: true } };
  }

  async healthCheck(credentials: WhatsAppAccountCredentials): Promise<HealthCheckResult> {
    return {
      healthy: true,
      displayPhoneNumber: `+1-mock-${credentials.phoneNumberId.slice(-4)}`,
      verifiedName: "Mock Business",
      qualityRating: "GREEN",
    };
  }
}
