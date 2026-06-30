import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ClientAuthService } from "../services/ClientAuthService";
import { AccountService } from "../services/AccountService";
import { ConversationService } from "../services/ConversationService";
import { MessageService } from "../services/MessageService";
import { UsageService } from "../services/UsageService";
import { prisma } from "../db/prisma";
import { ServiceError } from "../services/errors";

const COOKIE = "wac_client";

declare module "fastify" {
  interface FastifyRequest {
    clientId?: string;
  }
}

async function requireClient(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const clientId = ClientAuthService.verifyToken(req.cookies?.[COOKIE]);
  if (!clientId) {
    reply.code(401).send({ error: "unauthorized" });
    return;
  }
  req.clientId = clientId;
}

// Ensures the account belongs to the logged-in client (tenant isolation for the portal).
async function ownedAccount(accountId: string, clientId: string) {
  const account = await AccountService.getById(accountId);
  if (account.clientId !== clientId) throw new ServiceError("Not your account.", 403, "forbidden");
  return account;
}

// The customer-facing portal API. Everything here is scoped to the logged-in client.
export function registerPortalRoutes(app: FastifyInstance): void {
  app.post("/portal/api/login", async (req, reply) => {
    const { email, password } = (req.body ?? {}) as { email?: string; password?: string };
    const client = await ClientAuthService.verifyLogin(email ?? "", password ?? "");
    if (!client) return reply.code(401).send({ error: "invalid_credentials" });
    reply.setCookie(COOKIE, ClientAuthService.issueToken(client.id), { httpOnly: true, sameSite: "lax", path: "/" });
    return reply.send({ ok: true, client });
  });

  app.post("/portal/api/logout", async (_req, reply) => {
    reply.clearCookie(COOKIE, { path: "/" });
    return reply.send({ ok: true });
  });

  app.get("/portal/api/me", { preHandler: requireClient }, async (req, reply) => {
    const client = await prisma.client.findUnique({ where: { id: req.clientId! } });
    if (!client) return reply.code(401).send({ error: "unauthorized" });
    return reply.send({ id: client.id, name: client.name, email: client.email, companyName: client.companyName });
  });

  // The client's own WhatsApp accounts (no secrets).
  app.get("/portal/api/accounts", { preHandler: requireClient }, async (req) => {
    const accounts = await AccountService.list({ clientId: req.clientId! });
    return {
      data: accounts.map((a) => ({
        id: a.id, phoneNumberId: a.phoneNumberId, displayPhoneNumber: a.displayPhoneNumber,
        provider: a.provider, status: a.status, healthStatus: a.healthStatus,
      })),
    };
  });

  // Inbox: list conversation threads for an account.
  app.get("/portal/api/conversations", { preHandler: requireClient }, async (req) => {
    const { accountId } = req.query as { accountId: string };
    await ownedAccount(accountId, req.clientId!);
    return { data: await ConversationService.listThreads(accountId) };
  });

  // One thread's messages.
  app.get("/portal/api/conversations/:contact", { preHandler: requireClient }, async (req) => {
    const { contact } = req.params as { contact: string };
    const { accountId } = req.query as { accountId: string };
    await ownedAccount(accountId, req.clientId!);
    return { data: await ConversationService.getThread(accountId, contact) };
  });

  // Send a text reply in a thread.
  app.post("/portal/api/messages/send", { preHandler: requireClient }, async (req) => {
    const { accountId, to, body } = req.body as { accountId: string; to: string; body: string };
    await ownedAccount(accountId, req.clientId!);
    const msg = await MessageService.sendText(accountId, to, body);
    return { id: msg.id, status: msg.status };
  });

  // Usage/quota for the current cycle.
  app.get("/portal/api/usage", { preHandler: requireClient }, async (req) => {
    const { accountId } = req.query as { accountId: string };
    await ownedAccount(accountId, req.clientId!);
    return UsageService.getQuotaStatus(accountId);
  });
}
