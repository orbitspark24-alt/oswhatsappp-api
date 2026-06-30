import { createHash, createHmac, timingSafeEqual } from "crypto";
import { prisma } from "../db/prisma";
import { config } from "../config";
import { audit } from "../lib/audit";
import { NotFoundError } from "./errors";

// Auth for the customer-facing client portal. Separate from admin auth and from API keys:
// clients log in with email + a password the admin sets, and get a scoped session cookie.
function hashPassword(password: string): string {
  return "sha256$" + createHash("sha256").update(password).digest("hex");
}

function sessionSecret(): string {
  return (process.env.ADMIN_SESSION_SECRET || config.security.encryptionKey || "dev-secret") + ":client";
}

export const ClientAuthService = {
  // Admin sets/changes a client's portal password (enables portal login).
  async setPassword(clientId: string, password: string) {
    const client = await prisma.client.findUnique({ where: { id: clientId } });
    if (!client) throw new NotFoundError(`Client ${clientId} not found.`);
    await prisma.client.update({ where: { id: clientId }, data: { portalPasswordHash: hashPassword(password) } });
    await audit({ actorType: "admin", action: "client.set_portal_password", targetType: "client", targetId: clientId });
    return { ok: true };
  },

  async verifyLogin(email: string, password: string) {
    const client = await prisma.client.findUnique({ where: { email } });
    if (!client || !client.portalPasswordHash) return null;
    if (client.status !== "ACTIVE") return null;
    if (client.portalPasswordHash !== hashPassword(password)) return null;
    return { id: client.id, name: client.name, email: client.email, companyName: client.companyName };
  },

  issueToken(clientId: string): string {
    const sig = createHmac("sha256", sessionSecret()).update(clientId).digest("hex");
    return `${clientId}.${sig}`;
  },

  verifyToken(token?: string): string | null {
    if (!token) return null;
    const [clientId, sig] = token.split(".");
    if (!clientId || !sig) return null;
    const expected = createHmac("sha256", sessionSecret()).update(clientId).digest("hex");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    return clientId;
  },
};
