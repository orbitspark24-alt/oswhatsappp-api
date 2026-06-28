import Fastify from "fastify";
import { addRawBodyParser, registerMetaWebhookRoutes } from "./routes";
import { initEventSubscribers } from "../events/subscribers";
import { config } from "../config";
import { logger } from "../lib/logger";

// Standalone Meta webhook receiver. The same routes also mount inside the main API app
// (src/api/server.ts); this entrypoint keeps them runnable on their own.
export function buildWebhookServer() {
  const app = Fastify({ logger: false });
  initEventSubscribers();
  addRawBodyParser(app);
  registerMetaWebhookRoutes(app);
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
