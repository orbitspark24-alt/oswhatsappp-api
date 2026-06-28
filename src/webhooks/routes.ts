import { FastifyInstance, FastifyRequest } from "fastify";
import { WebhookService, WebhookPayload } from "../services/WebhookService";
import { logger } from "../lib/logger";

// Meta requires the raw request body to validate X-Hub-Signature-256, so capture it via a
// custom JSON content-type parser before parsing. Safe to use app-wide (it still JSON-parses).
export function addRawBodyParser(app: FastifyInstance): void {
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (_req, body, done) => {
    (_req as FastifyRequest & { rawBody?: Buffer }).rawBody = body as Buffer;
    try {
      done(null, JSON.parse((body as Buffer).toString() || "{}"));
    } catch (err) {
      done(err as Error);
    }
  });
}

// Mounts the Meta WhatsApp inbound webhook routes (verification handshake + event delivery).
export function registerMetaWebhookRoutes(app: FastifyInstance): void {
  app.get(
    "/webhooks/whatsapp",
    { schema: { tags: ["meta-webhooks"], summary: "Meta webhook verification handshake" } },
    async (req, reply) => {
      const challenge = WebhookService.handleVerification(req.query as Record<string, string>);
      if (challenge !== null) reply.type("text/plain").send(challenge);
      else reply.code(403).send("verification failed");
    }
  );

  app.post(
    "/webhooks/whatsapp",
    { schema: { tags: ["meta-webhooks"], summary: "Meta webhook event delivery (signed)" } },
    async (req, reply) => {
      const rawBody = (req as FastifyRequest & { rawBody?: Buffer }).rawBody ?? Buffer.from("");
      const signature = req.headers["x-hub-signature-256"] as string | undefined;

      if (!WebhookService.verifySignature(rawBody, signature)) {
        logger.warn("Rejected webhook with invalid signature");
        return reply.code(401).send({ error: "invalid signature" });
      }
      try {
        const result = await WebhookService.processEvent(req.body as WebhookPayload);
        logger.info(result, "Processed webhook event");
        return reply.code(200).send({ received: true, ...result });
      } catch (err) {
        logger.error({ err }, "Webhook processing error");
        return reply.code(200).send({ received: true });
      }
    }
  );
}
