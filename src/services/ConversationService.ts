import { prisma } from "../db/prisma";

export interface Thread {
  contact: string; // the customer's phone number (the non-business party)
  lastMessage: string;
  lastDirection: string;
  lastAt: Date;
  lastType: string;
  count: number;
}

// Powers the portal conversation inbox. A "thread" groups messages by the counterpart number
// (fromNumber on inbound, toNumber on outbound). Grouping is done in app code for portability
// across SQLite/Postgres; fine for typical per-account volumes.
export const ConversationService = {
  async listThreads(whatsappAccountId: string, limit = 500): Promise<Thread[]> {
    const messages = await prisma.message.findMany({
      where: { whatsappAccountId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    const byContact = new Map<string, Thread>();
    for (const m of messages) {
      const contact = m.direction === "INBOUND" ? m.fromNumber : m.toNumber;
      const existing = byContact.get(contact);
      if (!existing) {
        // messages are newest-first, so the first seen per contact is the latest.
        byContact.set(contact, {
          contact,
          lastMessage: preview(m.type, m.contentJson),
          lastDirection: m.direction,
          lastAt: m.createdAt,
          lastType: m.type,
          count: 1,
        });
      } else {
        existing.count++;
      }
    }
    return [...byContact.values()].sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime());
  },

  async getThread(whatsappAccountId: string, contact: string) {
    const messages = await prisma.message.findMany({
      where: {
        whatsappAccountId,
        OR: [{ fromNumber: contact }, { toNumber: contact }],
      },
      orderBy: { createdAt: "asc" },
      take: 500,
    });
    return messages.map((m) => ({
      id: m.id,
      direction: m.direction,
      type: m.type,
      text: preview(m.type, m.contentJson),
      status: m.status,
      at: m.createdAt,
    }));
  },
};

// Best-effort human-readable preview of a stored message payload.
function preview(type: string, contentJson: string): string {
  try {
    const c = JSON.parse(contentJson);
    if (type === "text") return c.body ?? c.text?.body ?? "[text]";
    if (c.text?.body) return c.text.body;
    if (type === "template") return `[template: ${c.name ?? "template"}]`;
    return `[${type}]`;
  } catch {
    return `[${type}]`;
  }
}
