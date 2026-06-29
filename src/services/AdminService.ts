import { createHash, createHmac, timingSafeEqual } from "crypto";
import { prisma } from "../db/prisma";
import { config } from "../config";

// Matches the seed's hashing scheme ("sha256$" + sha256(password)). This is intentionally
// simple for the bundled demo admin; for real multi-admin auth, swap in bcrypt/argon2.
function hashPassword(password: string): string {
  return "sha256$" + createHash("sha256").update(password).digest("hex");
}

function sessionSecret(): string {
  // Falls back to the encryption key so local dev works without extra config.
  return process.env.ADMIN_SESSION_SECRET || config.security.encryptionKey || "dev-admin-secret";
}

export const AdminService = {
  async verifyLogin(email: string, password: string) {
    const admin = await prisma.admin.findUnique({ where: { email } });
    if (!admin) return null;
    if (admin.passwordHash !== hashPassword(password)) return null;
    return { id: admin.id, email: admin.email, name: admin.name };
  },

  // Stateless signed session token: "<adminId>.<hmac>". No server-side session store needed.
  issueToken(adminId: string): string {
    const sig = createHmac("sha256", sessionSecret()).update(adminId).digest("hex");
    return `${adminId}.${sig}`;
  },

  verifyToken(token?: string): string | null {
    if (!token) return null;
    const [adminId, sig] = token.split(".");
    if (!adminId || !sig) return null;
    const expected = createHmac("sha256", sessionSecret()).update(adminId).digest("hex");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    return adminId;
  },
};
