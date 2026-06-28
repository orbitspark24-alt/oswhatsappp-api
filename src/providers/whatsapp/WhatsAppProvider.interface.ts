// Provider-agnostic contract for sending WhatsApp messages and checking account health.
// Business logic (services/) must depend only on this interface, never on a concrete
// provider, so a second BSP can be added later without touching callers.

export interface WhatsAppAccountCredentials {
  wabaId: string;
  phoneNumberId: string;
  /** Decrypted, plaintext — caller is responsible for decrypting via src/lib/crypto.ts first. */
  accessToken: string;
  appSecret?: string;
}

export interface SendTextMessageParams {
  /** Recipient in E.164 format without the leading "+" (Meta convention, e.g. "15551234567"). */
  to: string;
  body: string;
  previewUrl?: boolean;
}

export interface SendMessageResult {
  success: boolean;
  /** Meta's message id ("wamid...") when the provider accepted the message. */
  providerMessageId?: string;
  error?: string;
  raw?: unknown;
}

export interface HealthCheckResult {
  healthy: boolean;
  displayPhoneNumber?: string;
  verifiedName?: string;
  qualityRating?: string;
  error?: string;
}

export interface WhatsAppProvider {
  readonly name: string;
  sendTextMessage(
    credentials: WhatsAppAccountCredentials,
    params: SendTextMessageParams
  ): Promise<SendMessageResult>;
  healthCheck(credentials: WhatsAppAccountCredentials): Promise<HealthCheckResult>;
}
