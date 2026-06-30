import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { AdminService } from "../services/AdminService";
import { ClientService } from "../services/ClientService";
import { AccountService } from "../services/AccountService";
import { PlanService } from "../services/PlanService";
import { SubscriptionService } from "../services/SubscriptionService";
import { BillingService } from "../services/BillingService";
import { MessageService } from "../services/MessageService";
import { TemplateService } from "../services/TemplateService";
import { BroadcastService } from "../services/BroadcastService";
import { AnalyticsService } from "../services/AnalyticsService";
import { ApiKeyService } from "../services/ApiKeyService";
import { prisma } from "../db/prisma";

const COOKIE = "wac_admin";

declare module "fastify" {
  interface FastifyRequest {
    adminId?: string;
  }
}

// Session gate for every /admin/api route except login.
async function requireAdmin(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const token = req.cookies?.[COOKIE];
  const adminId = AdminService.verifyToken(token);
  if (!adminId) {
    reply.code(401).send({ error: "unauthorized" });
    return;
  }
  req.adminId = adminId;
}

// Mounts the admin web API. The static dashboard (public/) calls these endpoints.
export function registerAdminRoutes(app: FastifyInstance): void {
  // --- Auth ---
  app.post("/admin/api/login", async (req, reply) => {
    const { email, password } = (req.body ?? {}) as { email?: string; password?: string };
    const admin = await AdminService.verifyLogin(email ?? "", password ?? "");
    if (!admin) return reply.code(401).send({ error: "invalid_credentials" });
    const token = AdminService.issueToken(admin.id);
    reply.setCookie(COOKIE, token, { httpOnly: true, sameSite: "lax", path: "/" });
    return reply.send({ ok: true, admin });
  });

  app.post("/admin/api/logout", async (_req, reply) => {
    reply.clearCookie(COOKIE, { path: "/" });
    return reply.send({ ok: true });
  });

  app.get("/admin/api/me", { preHandler: requireAdmin }, async (req, reply) => {
    const admin = await prisma.admin.findUnique({ where: { id: req.adminId! } });
    if (!admin) return reply.code(401).send({ error: "unauthorized" });
    return reply.send({ id: admin.id, email: admin.email, name: admin.name });
  });

  // --- Overview ---
  app.get("/admin/api/overview", { preHandler: requireAdmin }, async () => {
    const [clients, accounts, plans, activeSubs, openInvoices, recent] = await Promise.all([
      prisma.client.count(),
      prisma.whatsAppAccount.count(),
      prisma.plan.count(),
      prisma.subscription.count({ where: { status: "ACTIVE" } }),
      prisma.invoice.count({ where: { status: { in: ["ISSUED", "OVERDUE"] } } }),
      prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 12 }),
    ]);
    return { stats: { clients, accounts, plans, activeSubs, openInvoices }, recent };
  });

  // --- Clients ---
  app.get("/admin/api/clients", { preHandler: requireAdmin }, async () => ({
    data: await ClientService.list(),
  }));
  app.post("/admin/api/clients", { preHandler: requireAdmin }, async (req) =>
    ClientService.create(req.body as never)
  );
  app.patch("/admin/api/clients/:id", { preHandler: requireAdmin }, async (req) => {
    const { id } = req.params as { id: string };
    return ClientService.update(id, req.body as never);
  });
  app.delete("/admin/api/clients/:id", { preHandler: requireAdmin }, async (req) => {
    const { id } = req.params as { id: string };
    await ClientService.delete(id);
    return { ok: true };
  });
  app.post("/admin/api/clients/:id/suspend", { preHandler: requireAdmin }, async (req) => {
    const { id } = req.params as { id: string };
    return ClientService.setStatus(id, "SUSPENDED");
  });
  app.post("/admin/api/clients/:id/activate", { preHandler: requireAdmin }, async (req) => {
    const { id } = req.params as { id: string };
    return ClientService.setStatus(id, "ACTIVE");
  });

  // --- Accounts ---
  app.get("/admin/api/accounts", { preHandler: requireAdmin }, async (req) => {
    const { clientId } = req.query as { clientId?: string };
    const accounts = await AccountService.list({ clientId });
    // Strip secret columns before returning to the browser.
    const data = accounts.map(({ accessTokenEncrypted, webhookVerifyTokenEncrypted, appSecretEncrypted, ...safe }) => safe);
    return { data };
  });
  app.post("/admin/api/accounts", { preHandler: requireAdmin }, async (req) =>
    AccountService.provision(req.body as never)
  );

  // One-shot "Connect WhatsApp" wizard: provision (CLOUD_API) -> health-check -> import
  // templates, returning the result of each step so the UI can show progress.
  app.post("/admin/api/accounts/connect", { preHandler: requireAdmin }, async (req) => {
    const body = req.body as {
      clientId: string; wabaId: string; phoneNumberId: string; accessToken: string; webhookVerifyToken?: string;
    };
    const account = await AccountService.provision({ ...body, provider: "CLOUD_API" });
    const { account: checked, result } = await AccountService.healthCheck(account.id);

    let templates = { fetched: 0, updated: 0, imported: 0 };
    if (result.healthy) {
      // Template import is best-effort — a healthy number is the success criterion.
      templates = await TemplateService.syncStatuses(account.id).catch(() => templates);
    }
    // Never echo secret columns, even as ciphertext.
    const { accessTokenEncrypted, webhookVerifyTokenEncrypted, appSecretEncrypted, ...safe } = checked;
    return { account: safe, health: result, templates };
  });
  app.post("/admin/api/accounts/:id/health-check", { preHandler: requireAdmin }, async (req) => {
    const { id } = req.params as { id: string };
    const { account, result } = await AccountService.healthCheck(id);
    return { account, result };
  });
  app.post("/admin/api/accounts/:id/suspend", { preHandler: requireAdmin }, async (req) => {
    const { id } = req.params as { id: string };
    return AccountService.suspend(id);
  });
  app.post("/admin/api/accounts/:id/resume", { preHandler: requireAdmin }, async (req) => {
    const { id } = req.params as { id: string };
    return AccountService.resume(id);
  });
  app.post("/admin/api/accounts/:id/deprovision", { preHandler: requireAdmin }, async (req) => {
    const { id } = req.params as { id: string };
    return AccountService.deprovision(id);
  });

  // --- Templates ---
  app.get("/admin/api/templates", { preHandler: requireAdmin }, async (req) => {
    const { accountId } = req.query as { accountId: string };
    return { data: await TemplateService.list(accountId) };
  });
  app.post("/admin/api/templates", { preHandler: requireAdmin }, async (req) =>
    TemplateService.create(req.body as never)
  );
  app.post("/admin/api/templates/:id/approve", { preHandler: requireAdmin }, async (req) => {
    const { id } = req.params as { id: string };
    return TemplateService.manualApprove(id);
  });
  app.post("/admin/api/templates/sync", { preHandler: requireAdmin }, async (req) => {
    const { accountId } = req.body as { accountId: string };
    return TemplateService.syncStatuses(accountId);
  });
  app.post("/admin/api/templates/:id/send", { preHandler: requireAdmin }, async (req) => {
    const { id } = req.params as { id: string };
    const { to, variables } = req.body as { to: string; variables?: string[] };
    return TemplateService.send(id, to, variables ?? []);
  });

  // --- Broadcast ---
  app.post("/admin/api/broadcasts", { preHandler: requireAdmin }, async (req) => {
    const { templateId, recipients } = req.body as { templateId: string; recipients: { to: string; variables?: string[] }[] };
    return BroadcastService.broadcastTemplate(templateId, recipients);
  });

  // --- Billing ---
  app.get("/admin/api/plans", { preHandler: requireAdmin }, async () => ({ data: await PlanService.list() }));
  app.get("/admin/api/subscriptions", { preHandler: requireAdmin }, async (req) => {
    const { clientId } = req.query as { clientId?: string };
    return { data: await SubscriptionService.list({ clientId }) };
  });
  app.post("/admin/api/subscriptions", { preHandler: requireAdmin }, async (req) =>
    SubscriptionService.create(req.body as never)
  );
  app.get("/admin/api/invoices", { preHandler: requireAdmin }, async (req) => {
    const { clientId } = req.query as { clientId?: string };
    return { data: await BillingService.listInvoices({ clientId }) };
  });
  app.post("/admin/api/invoices/:id/pay", { preHandler: requireAdmin }, async (req) => {
    const { id } = req.params as { id: string };
    const { reference } = (req.body ?? {}) as { reference?: string };
    return BillingService.payInvoice(id, { reference });
  });

  // --- Messaging ---
  app.get("/admin/api/messages", { preHandler: requireAdmin }, async (req) => {
    const { accountId, contact } = req.query as { accountId: string; contact?: string };
    return { data: await MessageService.list(accountId, { contact }) };
  });
  app.post("/admin/api/messages/send", { preHandler: requireAdmin }, async (req) => {
    const { accountId, to, body } = req.body as { accountId: string; to: string; body: string };
    return MessageService.sendText(accountId, to, body);
  });

  // --- Analytics ---
  app.get("/admin/api/analytics/:clientId", { preHandler: requireAdmin }, async (req) => {
    const { clientId } = req.params as { clientId: string };
    return AnalyticsService.forClient(clientId);
  });

  // --- API keys ---
  app.get("/admin/api/apikeys", { preHandler: requireAdmin }, async (req) => {
    const { clientId } = req.query as { clientId: string };
    return { data: await ApiKeyService.listByClient(clientId) };
  });
  app.post("/admin/api/apikeys", { preHandler: requireAdmin }, async (req) => {
    const { clientId } = req.body as { clientId: string };
    return ApiKeyService.create(clientId, ["*"]);
  });
}
