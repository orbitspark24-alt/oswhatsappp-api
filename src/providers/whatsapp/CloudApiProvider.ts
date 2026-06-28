import axios, { AxiosError } from "axios";
import { config } from "../../config";
import { logger } from "../../lib/logger";
import {
  WhatsAppProvider,
  WhatsAppAccountCredentials,
  SendTextMessageParams,
  SendMessageResult,
  HealthCheckResult,
} from "./WhatsAppProvider.interface";

// Meta WhatsApp Cloud API adapter.
//
// Version assumption: graph API version is read from META_GRAPH_API_VERSION (default v22.0,
// set in .env.example). Confirmed against Meta's Graph API changelog (checked 2026-06): v21.0
// through v25.0 are all currently supported with no deprecation date set; v25.0 is latest.
// v22.0 was chosen as a default with deprecation margin, not because newer versions are
// unsupported — bump the env var as needed, no code change required.
//
// Endpoints used (stable across the versions above):
//   POST /{version}/{phone-number-id}/messages           — send a message
//   GET  /{version}/{phone-number-id}?fields=...          — health check / number metadata
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

  async sendTextMessage(
    credentials: WhatsAppAccountCredentials,
    params: SendTextMessageParams
  ): Promise<SendMessageResult> {
    try {
      const response = await axios.post(
        graphUrl(`/${credentials.phoneNumberId}/messages`),
        {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: params.to,
          type: "text",
          text: {
            preview_url: params.previewUrl ?? false,
            body: params.body,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${credentials.accessToken}`,
            "Content-Type": "application/json",
          },
        }
      );

      const providerMessageId = response.data?.messages?.[0]?.id;
      return { success: true, providerMessageId, raw: response.data };
    } catch (error) {
      const message = extractErrorMessage(error);
      logger.error({ phoneNumberId: credentials.phoneNumberId }, `CloudApiProvider.sendTextMessage failed: ${message}`);
      return { success: false, error: message };
    }
  }

  async healthCheck(credentials: WhatsAppAccountCredentials): Promise<HealthCheckResult> {
    try {
      const response = await axios.get(
        graphUrl(`/${credentials.phoneNumberId}`),
        {
          params: { fields: "display_phone_number,verified_name,quality_rating" },
          headers: { Authorization: `Bearer ${credentials.accessToken}` },
        }
      );

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
}
