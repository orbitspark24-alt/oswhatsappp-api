import { createHash, randomBytes } from "crypto";
import { ApiKeyRepository } from "../repositories/ApiKeyRepository";
import { ClientService } from "./ClientService";
import { audit } from "../lib/audit";
import { NotFoundError, ServiceError } from "./errors";

// API keys are shown to the operator exactly once at creation; only a SHA-256 hash is stored.
function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

function generateKey(): string {
  return "wac_live_" + randomBytes(24).toString("hex");
}

export const ApiKeyService = {
  // Issue a new key for a client. Returns the plaintext key once; it cannot be retrieved later.
  async create(clientId: string, scopes: string[] = ["*"]) {
    await ClientService.getById(clientId);
    const key = generateKey();
    const record = await ApiKeyRepository.create({
      client: { connect: { id: clientId } },
      prefix: key.slice(0, 16),
      keyHash: hashKey(key),
      scopesJson: JSON.stringify(scopes),
    });
    await audit({
      actorType: "admin",
      action: "api_key.create",
      targetType: "api_key",
      targetId: record.id,
      metadata: { clientId, scopes },
    });
    return { id: record.id, key, prefix: record.prefix, scopes };
  },

  // Resolve a presented key to its client + scopes; updates lastUsedAt. Returns null if invalid.
  async authenticate(presentedKey: string) {
    if (!presentedKey) return null;
    const record = await ApiKeyRepository.findByHash(hashKey(presentedKey));
    if (!record) return null;
    if (record.client.status !== "ACTIVE") return null;
    await ApiKeyRepository.touchLastUsed(record.id).catch(() => undefined);
    let scopes: string[] = ["*"];
    try {
      scopes = JSON.parse(record.scopesJson);
    } catch {
      /* default to wildcard */
    }
    return { apiKeyId: record.id, clientId: record.clientId, client: record.client, scopes };
  },

  listByClient(clientId: string) {
    return ApiKeyRepository.listByClient(clientId);
  },

  async revoke(id: string) {
    const existing = await ApiKeyRepository.findById(id);
    if (!existing) throw new NotFoundError(`API key ${id} not found.`);
    await ApiKeyRepository.update(id, { status: "REVOKED", revokedAt: new Date() });
    await audit({ actorType: "admin", action: "api_key.revoke", targetType: "api_key", targetId: id });
  },

  // Revoke + reissue in one step, preserving scopes.
  async rotate(id: string) {
    const existing = await ApiKeyRepository.findById(id);
    if (!existing) throw new NotFoundError(`API key ${id} not found.`);
    if (existing.status !== "ACTIVE") throw new ServiceError("Only an active key can be rotated.");
    await ApiKeyService.revoke(id);
    let scopes: string[] = ["*"];
    try {
      scopes = JSON.parse(existing.scopesJson);
    } catch {
      /* default */
    }
    return ApiKeyService.create(existing.clientId, scopes);
  },

  // Scope check: "*" grants everything, else an exact match is required.
  hasScope(scopes: string[], required: string): boolean {
    return scopes.includes("*") || scopes.includes(required);
  },
};
