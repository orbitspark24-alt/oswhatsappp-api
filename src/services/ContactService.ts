import { z } from "zod";
import { ContactRepository } from "../repositories/ContactRepository";
import { ClientService } from "./ClientService";
import { audit } from "../lib/audit";

export const UpsertContactInput = z.object({
  clientId: z.string().min(1),
  phoneNumber: z.string().min(1),
  name: z.string().optional(),
  whatsappAccountId: z.string().optional(),
  tags: z.array(z.string()).optional(),
});
export type UpsertContactInput = z.infer<typeof UpsertContactInput>;

export const ContactService = {
  async upsert(input: UpsertContactInput) {
    const data = UpsertContactInput.parse(input);
    await ClientService.getById(data.clientId);
    const contact = await ContactRepository.upsert(data.clientId, data.phoneNumber, {
      client: { connect: { id: data.clientId } },
      phoneNumber: data.phoneNumber,
      name: data.name,
      whatsappAccount: data.whatsappAccountId ? { connect: { id: data.whatsappAccountId } } : undefined,
      tagsJson: data.tags ? JSON.stringify(data.tags) : "[]",
    } as never);
    await audit({
      actorType: "admin",
      action: "contact.upsert",
      targetType: "contact",
      targetId: contact.id,
      metadata: { clientId: data.clientId },
    });
    return contact;
  },

  list(clientId: string, params?: { optInStatus?: string }) {
    return ContactRepository.list(clientId, params);
  },

  async setOptIn(clientId: string, phoneNumber: string, optedIn: boolean) {
    const contact = await ContactRepository.findByPhone(clientId, phoneNumber);
    if (!contact) {
      // Auto-create on opt-in/out so callers don't have to pre-register the number.
      return ContactRepository.upsert(clientId, phoneNumber, {
        client: { connect: { id: clientId } },
        phoneNumber,
        optInStatus: optedIn ? "OPTED_IN" : "OPTED_OUT",
        optInAt: optedIn ? new Date() : null,
        optOutAt: optedIn ? null : new Date(),
      } as never);
    }
    return ContactRepository.update(contact.id, {
      optInStatus: optedIn ? "OPTED_IN" : "OPTED_OUT",
      optInAt: optedIn ? new Date() : contact.optInAt,
      optOutAt: optedIn ? contact.optOutAt : new Date(),
    });
  },
};
