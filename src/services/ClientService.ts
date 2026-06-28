import { z } from "zod";
import { ClientRepository } from "../repositories/ClientRepository";
import { ClientStatus } from "../types/enums";
import { audit } from "../lib/audit";
import { ConflictError, NotFoundError, ValidationError } from "./errors";

export const CreateClientInput = z.object({
  name: z.string().min(1, "name is required"),
  email: z.string().email("valid email is required"),
  companyName: z.string().optional(),
  phone: z.string().optional(),
});
export type CreateClientInput = z.infer<typeof CreateClientInput>;

export const UpdateClientInput = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  companyName: z.string().optional(),
  phone: z.string().optional(),
  status: ClientStatus.optional(),
});
export type UpdateClientInput = z.infer<typeof UpdateClientInput>;

// Business logic for managing reseller clients. Shared by the CLI and the REST API.
export const ClientService = {
  async create(input: CreateClientInput) {
    const data = CreateClientInput.parse(input);

    const existing = await ClientRepository.findByEmail(data.email);
    if (existing) {
      throw new ConflictError(`A client with email ${data.email} already exists.`);
    }

    const client = await ClientRepository.create({
      name: data.name,
      email: data.email,
      companyName: data.companyName,
      phone: data.phone,
    });

    await audit({
      actorType: "admin",
      action: "client.create",
      targetType: "client",
      targetId: client.id,
      metadata: { email: client.email },
    });

    return client;
  },

  async getById(id: string) {
    const client = await ClientRepository.findById(id);
    if (!client) throw new NotFoundError(`Client ${id} not found.`);
    return client;
  },

  list(params?: { status?: string }) {
    if (params?.status) ClientStatus.parse(params.status);
    return ClientRepository.list(params);
  },

  async update(id: string, input: UpdateClientInput) {
    const data = UpdateClientInput.parse(input);
    await ClientService.getById(id); // ensures it exists

    if (data.email) {
      const other = await ClientRepository.findByEmail(data.email);
      if (other && other.id !== id) {
        throw new ConflictError(`Email ${data.email} is already used by another client.`);
      }
    }

    const client = await ClientRepository.update(id, data);
    await audit({
      actorType: "admin",
      action: "client.update",
      targetType: "client",
      targetId: id,
      metadata: { fields: Object.keys(data) },
    });
    return client;
  },

  async setStatus(id: string, status: string) {
    const parsed = ClientStatus.parse(status);
    const client = await ClientRepository.update(id, { status: parsed });
    await audit({
      actorType: "admin",
      action: `client.${parsed.toLowerCase()}`,
      targetType: "client",
      targetId: id,
    });
    return client;
  },

  async delete(id: string) {
    await ClientService.getById(id);
    await ClientRepository.delete(id);
    await audit({
      actorType: "admin",
      action: "client.delete",
      targetType: "client",
      targetId: id,
    });
  },
};
