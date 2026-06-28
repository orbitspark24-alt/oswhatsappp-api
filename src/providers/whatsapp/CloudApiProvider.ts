import axios, { AxiosError } from "axios";
import { config } from "../../config";
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

// Meta WhatsApp Cloud API adapter.
//
// Version assumption: graph API version is read from META_GRAPH_API_VERSION (default v22.0,
// set in .env.example). Confirmed against Meta's Graph API changelog (checked 2026-06): v21.0
// through v25.0 are all currently supported with no deprecation date set; v25.0 is latest.
// v22.0 was chosen as a default with deprecation margin — bump the env var as needed.
//
// Endpoints used (stable across the versions above):
//   POST /{version}/{phone-number-id}/messages          — send a message
//   GET  /{version}/{phone-number-id}?fields=...         — health check / number metadata
//   POST /{version}/{waba-id}/message_templates          — create a template
//   GET  /{version}/{waba-id}/message_templates          — list templates + approval status
const GRAPH_BASE_URL = "https://graph.facebook.com";

function graphUrl(path: string): string {
  return `${GRAPH_BASE_URL}/${config.meta.graphApiVersion}${path}`;
}

function extractErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<{ error?: { message?: string } }>;
    return axiosError.response?.data?.error?.message ?? axiosError.message;
  }
  return error instanceof Error ? error.message : String(error);
}

export class CloudApiProvider implements WhatsAppProvider {
  readonly name = "cloud_api";

  async sendMessage(
    credentials: WhatsAppAccountCredentials,
    params: SendMessageParams
  ): Promise<SendMessageResult> {
    try {
      const body = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: params.to,
        type: params.type,
        // Meta keys the type-specific object by the message type, e.g. { type:"image", image:{...} }.
        [params.type]: params.content,
      };

      const response = await axios.post(graphUrl(`/${credentials.phoneNumberId}/messages`), body, {
        headers: {
          Authorization: `Bearer ${credentials.accessToken}`,
          "Content-Type": "application/json",
        },
      });

      return { success: true, providerMessageId: response.data?.messages?.[0]?.id, raw: response.data };
    } catch (error) {
      const message = extractErrorMessage(error);
      logger.error(
        { phoneNumberId: credentials.phoneNumberId, type: params.type },
        `CloudApiProvider.sendMessage failed: ${message}`
      );
      return { success: false, error: message };
    }
  }

  sendTextMessage(
    credentials: WhatsAppAccountCredentials,
    params: SendTextMessageParams
  ): Promise<SendMessageResult> {
    return this.sendMessage(credentials, {
      to: params.to,
      type: "text",
      content: { preview_url: params.previewUrl ?? false, body: params.body },
    });
  }

  async healthCheck(credentials: WhatsAppAccountCredentials): Promise<HealthCheckResult> {
    try {
      const response = await axios.get(graphUrl(`/${credentials.phoneNumberId}`), {
        params: { fields: "display_phone_number,verified_name,quality_rating" },
        headers: { Authorization: `Bearer ${credentials.accessToken}` },
      });
      return {
        healthy: true,
        displayPhoneNumber: response.data?.display_phone_number,
        verifiedName: response.data?.verified_name,
        qualityRating: response.data?.quality_rating,
      };
    } catch (error) {
      const message = extractErrorMessage(error);
      logger.warn({ phoneNumberId: credentials.phoneNumberId }, `CloudApiProvider.healthCheck failed: ${message}`);
      return { healthy: false, error: message };
    }
  }

  async createTemplate(
    credentials: WhatsAppAccountCredentials,
    def: TemplateDefinition
  ): Promise<CreateTemplateResult> {
    try {
      const response = await axios.post(
        graphUrl(`/${credentials.wabaId}/message_templates`),
        {
          name: def.name,
          language: def.language,
          category: def.category,
          components: def.components,
        },
        { headers: { Authorization: `Bearer ${credentials.accessToken}`, "Content-Type": "application/json" } }
      );
      // Meta returns an id and an initial status (usually PENDING).
      return {
        success: true,
        metaTemplateId: response.data?.id,
        status: (response.data?.status ?? "PENDING").toString().toUpperCase(),
      };
    } catch (error) {
      return { success: false, error: extractErrorMessage(error) };
    }
  }

  async listTemplates(
    credentials: WhatsAppAccountCredentials
  ): Promise<{ templates: RemoteTemplate[]; error?: string }> {
    try {
      const response = await axios.get(graphUrl(`/${credentials.wabaId}/message_templates`), {
        params: { fields: "name,language,status,category,id", limit: 200 },
        headers: { Authorization: `Bearer ${credentials.accessToken}` },
      });
      const templates: RemoteTemplate[] = (response.data?.data ?? []).map((t: Record<string, unknown>) => ({
        name: String(t.name),
        language: String(t.language),
        status: String(t.status).toUpperCase(),
        category: t.category ? String(t.category) : undefined,
        metaTemplateId: t.id ? String(t.id) : undefined,
      }));
      return { templates };
    } catch (error) {
      return { templates: [], error: extractErrorMessage(error) };
    }
  }
}
