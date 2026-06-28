import Fastify, { FastifyRequest } from "fastify";
import { WebhookService, WebhookPayload } from "../services/WebhookService";
import { config } from "../config";
import { logger } from "../lib/logger";

// Standalone Meta webhook receiver. In step 6 these same routes fold into the main API app;
// kept runnable on its own here so inbound message + status handling works at this stage.
//
// Meta requires the raw request body to validate X-Hub-Signature-256, so we capture it via a
// custom JSON content-type parser before parsing.
export function buildWebhookServer() {
  const app = Fastify({ logger: false });

  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (_req, body, done) => {
    (_req as FastifyRequest & { rawBody?: Buffer }).rawBody = body as Buffer;
    try {
      done(null, JSON.parse(body.toString() || "{}"));
    } catch (err) {
      done(err as Error);
    }
  });

  // Verification handshake (GET) — Meta calls this once when you register the callback URL.
  app.get("/webhooks/whatsapp", async (req, reply) => {
    const challenge = WebhookService.handleVerification(req.query as Record<string, string>);
    if (challenge !== null) {
      reply.type("text/plain").send(challenge);
    } else {
      reply.code(403).send("verification failed");
    }
  });

  // Event delivery (POST) — inbound messages and delivery/read statuses.
  app.post("/webhooks/whatsapp", async (req, reply) => {
    const rawBody = (req as FastifyRequest & { rawBody?: Buffer }).rawBody ?? Buffer.from("");
    const signature = req.headers["x-hub-signature-256"] as string | undefined;

    if (!WebhookService.verifySignature(rawBody, signature)) {
      logger.warn("Rejected webhook with invalid signature");
      return reply.code(401).send({ error: "invalid signature" });
    }

    try {
      const result = await WebhookService.processEvent(req.body as WebhookPayload);
      logger.info(result, "Processed webhook event");
      // Always 200 quickly so Meta does not retry; processing already persisted.
      return reply.code(200).send({ received: true, ...result });
    } catch (err) {
      logger.error({ err }, "Webhook processing error");
      // Still 200 to avoid Meta retry storms; the error is logged for investigation.
      return reply.code(200).send({ received: true });
    }
  });

  app.get("/health", async () => ({ ok: true }));

  return app;
}

if (require.main === module) {
  const app = buildWebhookServer();
  app
    .listen({ port: config.api.port, host: config.api.host })
    .then(() => logger.info(`Webhook server listening on ${config.api.host}:${config.api.port}`))
    .catch((err) => {
      logger.error({ err }, "Failed to start webhook server");
      process.exit(1);
    });
}
