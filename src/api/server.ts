import path from "path";
import Fastify, { FastifyInstance } from "fastify";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import fastifyStatic from "@fastify/static";
import fastifyCookie from "@fastify/cookie";
import { ZodError } from "zod";
import { config } from "../config";
import { logger } from "../lib/logger";
import { ServiceError } from "../services/errors";
import { ensureBootstrap } from "../lib/bootstrap";
import { initEventSubscribers } from "../events/subscribers";
import { addRawBodyParser, registerMetaWebhookRoutes } from "../webhooks/routes";
import { registerMessageRoutes } from "./routes/messages";
import { registerAnalyticsRoutes } from "./routes/analytics";
import { registerTemplateRoutes } from "./routes/templates";
import { registerContactRoutes } from "./routes/contacts";
import { registerAccountRoutes } from "./routes/account";
import { registerBillingRoutes } from "./routes/billing";
import { registerWebhookEndpointRoutes } from "./routes/webhookEndpoints";
import { registerAdminRoutes } from "../admin/routes";
import { registerPortalRoutes } from "../portal/routes";

// Public REST API for the CRM. Mirrors the service layer the CLI uses, so console and CRM
// stay in sync. Secured with per-client API keys (Authorization: Bearer wac_live_...).
export async function buildApiServer(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  // Wire domain events to outbound CRM webhook delivery.
  initEventSubscribers();

  addRawBodyParser(app);

  // Cookie support for the admin dashboard session.
  await app.register(fastifyCookie);

  // Serve the admin dashboard (public/) at the root. The compiled build runs from dist/,
  // so resolve public/ relative to the project root in both ts-node and built modes.
  await app.register(fastifyStatic, {
    root: path.resolve(__dirname, "..", "..", "public"),
    prefix: "/",
  });

  // OpenAPI spec + Swagger UI so the CRM can be built against a generated contract.
  await app.register(swagger, {
    openapi: {
      info: {
        title: "WhatsApp Reseller Console API",
        description: "Public API for CRM integration: messaging, templates, contacts, usage, billing, webhooks.",
        version: "1.0.0",
      },
      components: {
        securitySchemes: {
          apiKey: { type: "http", scheme: "bearer", description: "Per-client API key: wac_live_..." },
        },
      },
    },
  });
  await app.register(swaggerUi, { routePrefix: "/docs" });

  // Uniform error mapping: ServiceError -> its statusCode, ZodError -> 422, else 500.
  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof ServiceError) {
      return reply.code(error.statusCode).send({ error: error.code, message: error.message });
    }
    if (error instanceof ZodError) {
      return reply.code(422).send({ error: "validation_error", message: error.errors });
    }
    logger.error({ err: error }, "Unhandled API error");
    return reply.code(error.statusCode ?? 500).send({ error: "internal_error", message: error.message });
  });

  // Inbound Meta webhooks (verification + signed event delivery).
  registerMetaWebhookRoutes(app);

  // Public CRM-facing API.
  registerMessageRoutes(app);
  registerTemplateRoutes(app);
  registerContactRoutes(app);
  registerAccountRoutes(app);
  registerBillingRoutes(app);
  registerWebhookEndpointRoutes(app);
  registerAnalyticsRoutes(app);

  // Admin dashboard JSON API (session-cookie auth) backing the static UI at "/".
  registerAdminRoutes(app);

  // Customer-facing client portal JSON API, backing the static portal at "/portal".
  registerPortalRoutes(app);

  app.get("/health", { schema: { tags: ["system"], summary: "Health check" } }, async () => ({ ok: true }));

  return app;
}

if (require.main === module) {
  ensureBootstrap()
    .then(() => buildApiServer())
    .then((app) =>
      app.listen({ port: config.api.port, host: config.api.host }).then(() => {
        logger.info(`API listening on ${config.api.host}:${config.api.port} (docs at /docs)`);
      })
    )
    .catch((err) => {
      logger.error({ err }, "Failed to start API server");
      process.exit(1);
    });
}
