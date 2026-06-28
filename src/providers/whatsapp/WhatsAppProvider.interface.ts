// Provider-agnostic contract for sending WhatsApp messages, managing templates, and checking
// account health. Business logic (services/) depends only on this interface, never on a concrete
// provider, so a second BSP can be added later without touching callers.

export interface WhatsAppAccountCredentials {
  wabaId: string;
  phoneNumberId: string;
  /** Decrypted, plaintext — caller decrypts via src/lib/crypto.ts before passing in. */
  accessToken: string;
  appSecret?: string;
}

// Message type as Meta names it; the `content` object is the type-specific body Meta expects,
// e.g. image: { link, caption }; location: { latitude, longitude, name, address };
// interactive: { type, body, action }; template: { name, language, components }.
export type WhatsAppMessageType =
  | "text"
  | "image"
  | "video"
  | "document"
  | "audio"
  | "location"
  | "contacts"
  | "interactive"
  | "template";

export interface SendMessageParams {
  /** Recipient in E.164 without the leading "+" (Meta convention, e.g. "15551234567"). */
  to: string;
  type: WhatsAppMessageType;
  content: Record<string, unknown>;
}

export interface SendTextMessageParams {
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

export interface TemplateDefinition {
  name: string;
  language: string;
  category: string; // MARKETING | UTILITY | AUTHENTICATION
  components: unknown[]; // Meta component structure
}

export interface CreateTemplateResult {
  success: boolean;
  metaTemplateId?: string;
  status?: string;
  error?: string;
}

export interface RemoteTemplate {
  name: string;
  language: string;
  status: string;
  category?: string;
  metaTemplateId?: string;
}

export interface WhatsAppProvider {
  readonly name: string;

  sendMessage(
    credentials: WhatsAppAccountCredentials,
    params: SendMessageParams
  ): Promise<SendMessageResult>;

  sendTextMessage(
    credentials: WhatsAppAccountCredentials,
    params: SendTextMessageParams
  ): Promise<SendMessageResult>;

  healthCheck(credentials: WhatsAppAccountCredentials): Promise<HealthCheckResult>;

  createTemplate(
    credentials: WhatsAppAccountCredentials,
    def: TemplateDefinition
  ): Promise<CreateTemplateResult>;

  listTemplates(
    credentials: WhatsAppAccountCredentials
  ): Promise<{ templates: RemoteTemplate[]; error?: string }>;
}
