import * as dotenv from "dotenv";

dotenv.config();

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export const config = {
  db: {
    provider: required("DB_PROVIDER", "sqlite"),
    url: required("DATABASE_URL", "file:./dev.db"),
  },
  security: {
    encryptionKey: process.env.ENCRYPTION_KEY ?? "",
  },
  meta: {
    appId: process.env.META_APP_ID ?? "",
    appSecret: process.env.META_APP_SECRET ?? "",
    // Pinned via env so the integration's version assumption is explicit and bump-able
    // without a code change. See src/providers/whatsapp/CloudApiProvider.ts for notes.
    graphApiVersion: process.env.META_GRAPH_API_VERSION ?? "v20.0",
    defaultWebhookVerifyToken: process.env.META_WEBHOOK_VERIFY_TOKEN_DEFAULT ?? "",
  },
  api: {
    // Most PaaS hosts (Render, Railway, Fly, Heroku) inject the port via PORT — honor it first.
    port: Number(process.env.PORT ?? process.env.API_PORT ?? 3000),
    host: process.env.API_HOST ?? "0.0.0.0",
    rateLimitMax: Number(process.env.API_RATE_LIMIT_MAX ?? 100),
    rateLimitWindowMs: Number(process.env.API_RATE_LIMIT_WINDOW_MS ?? 60000),
  },
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  logLevel: process.env.LOG_LEVEL ?? "info",
};
