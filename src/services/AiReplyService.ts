import Anthropic from "@anthropic-ai/sdk";
import { logger } from "../lib/logger";

// AI-generated auto-replies via the Claude API (official @anthropic-ai/sdk).
//
// Model default is claude-opus-4-8 (Anthropic's recommended default). For high-volume
// customer auto-reply a client may set model="claude-haiku-4-5" on the rule to cut cost —
// that's their explicit choice, configured per automation rule, not a silent downgrade.
//
// Requires ANTHROPIC_API_KEY in the environment. If unset, AI replies are skipped gracefully
// so the rest of the automation engine keeps working.

let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic();
  return client;
}

export interface AiReplyTurn {
  role: "user" | "assistant"; // user = the customer, assistant = the business
  text: string;
}

export const AiReplyService = {
  isConfigured(): boolean {
    return !!process.env.ANTHROPIC_API_KEY;
  },

  // Generate a reply given the business's instructions (systemPrompt) and recent conversation.
  // Returns null on any error or if not configured, so the caller can fall through safely.
  async generate(params: {
    systemPrompt: string;
    history: AiReplyTurn[];
    model?: string;
    maxChars?: number;
  }): Promise<string | null> {
    const anthropic = getClient();
    if (!anthropic) {
      logger.warn("ANTHROPIC_API_KEY unset — skipping AI auto-reply.");
      return null;
    }

    const model = params.model || "claude-opus-4-8";
    const maxChars = params.maxChars ?? 600;

    const system =
      `${params.systemPrompt}\n\n` +
      `You are replying to a customer over WhatsApp on behalf of the business. ` +
      `Keep replies concise (under ${maxChars} characters), friendly, and helpful. ` +
      `Reply with the message text only — no preamble, no quotes.`;

    try {
      const response = await anthropic.messages.create({
        model,
        max_tokens: 1024,
        system,
        messages: params.history.map((t) => ({ role: t.role, content: t.text })),
      });
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("")
        .trim();
      return text || null;
    } catch (err) {
      logger.error({ err: (err as Error).message, model }, "AI auto-reply generation failed");
      return null;
    }
  },
};
