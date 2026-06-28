import { FastifyReply, FastifyRequest } from "fastify";
import { ApiKeyService } from "../services/ApiKeyService";
import { AccountService } from "../services/AccountService";
import { config } from "../config";
import { ServiceError } from "../services/errors";

// Authenticated context attached to each request after the API-key check.
export interface AuthContext {
  apiKeyId: string;
  clientId: string;
  scopes: string[];
}

declare module "fastify" {
  interface FastifyRequest {
    auth?: AuthContext;
  }
}

// --- Simple in-memory sliding-window rate limiter, keyed by API key id. ---
// Sufficient for a single-process deployment; swap for @fastify/rate-limit + Redis when
// the API is horizontally scaled.
const hits = new Map<string, number[]>();

function rateLimited(key: string): boolean {
  const now = Date.now();
  const windowStart = now - config.api.rateLimitWindowMs;
  const timestamps = (hits.get(key) ?? []).filter((t) => t > windowStart);
  timestamps.push(now);
  hits.set(key, timestamps);
  return timestamps.length > config.api.rateLimitMax;
}

function bearerToken(req: FastifyRequest): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim();
}

// preHandler: authenticate the API key, attach req.auth, and apply rate limiting.
export async function authenticate(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const token = bearerToken(req);
  if (!token) {
    reply.code(401).send({ error: "missing_api_key", message: "Provide an API key as 'Authorization: Bearer <key>'." });
    return;
  }
  const auth = await ApiKeyService.authenticate(token);
  if (!auth) {
    reply.code(401).send({ error: "invalid_api_key", message: "API key is invalid, revoked, or the client is inactive." });
    return;
  }

  if (rateLimited(auth.apiKeyId)) {
    reply.code(429).send({ error: "rate_limited", message: "Too many requests. Slow down." });
    return;
  }

  req.auth = { apiKeyId: auth.apiKeyId, clientId: auth.clientId, scopes: auth.scopes };
}

// preHandler factory: require a specific scope (after authenticate has run).
export function requireScope(scope: string) {
  return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!req.auth || !ApiKeyService.hasScope(req.auth.scopes, scope)) {
      reply.code(403).send({ error: "forbidden", message: `Missing required scope: ${scope}` });
    }
  };
}

// Ensures the target account belongs to the authenticated client (tenant isolation).
export async function assertAccountOwned(accountId: string, clientId: string) {
  const account = await AccountService.getById(accountId);
  if (account.clientId !== clientId) {
    throw new ServiceError("Account does not belong to your client.", 403, "forbidden");
  }
  return account;
}
