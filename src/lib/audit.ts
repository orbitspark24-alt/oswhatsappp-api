import { prisma } from "../db/prisma";
import { logger } from "./logger";

export interface AuditEntry {
  actorType: "admin" | "api_key" | "system";
  actorId?: string;
  adminId?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}

// Append-only record of every meaningful action taken through services, so the
// console and the API share one accountability trail. Never include secrets in metadata.
export async function audit(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorType: entry.actorType,
        actorId: entry.actorId,
        adminId: entry.adminId,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId,
        metadataJson: JSON.stringify(entry.metadata ?? {}),
      },
    });
  } catch (err) {
    // Auditing must never break the primary action; log and move on.
    logger.error({ err, action: entry.action }, "Failed to write audit log entry");
  }
}
