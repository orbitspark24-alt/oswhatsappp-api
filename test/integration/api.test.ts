import { describe, it, expect, beforeAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApiServer } from "../../src/api/server";
import { ClientService } from "../../src/services/ClientService";
import { AccountService } from "../../src/services/AccountService";
import { ApiKeyService } from "../../src/services/ApiKeyService";

// Drives the public API in-process via app.inject() — no network, no open port.
describe("public API (integration)", () => {
  let app: FastifyInstance;
  let apiKey: string;
  let accountId: string;
  let otherAccountId: string;

  beforeAll(async () => {
    app = await buildApiServer();
    await app.ready();

    const client = await ClientService.create({ name: "API Co", email: `api${Date.now()}@t.local` });
    const account = await AccountService.provision({
      clientId: client.id,
      wabaId: "w",
      phoneNumberId: `pn-api-${Date.now()}`,
      accessToken: "tok",
      provider: "MOCK",
      webhookVerifyToken: "vt",
    });
    accountId = account.id;
    await AccountService.healthCheck(accountId); // -> ACTIVE
    apiKey = (await ApiKeyService.create(client.id, ["*"])).key;

    // A second client's account, to test tenant isolation.
    const other = await ClientService.create({ name: "Other Co", email: `other${Date.now()}@t.local` });
    const otherAccount = await AccountService.provision({
      clientId: other.id,
      wabaId: "w",
      phoneNumberId: `pn-other-${Date.now()}`,
      accessToken: "tok",
      provider: "MOCK",
      webhookVerifyToken: "vt",
    });
    otherAccountId = otherAccount.id;
    await AccountService.healthCheck(otherAccountId);
  });

  it("rejects requests without an API key (401)", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/accounts" });
    expect(res.statusCode).toBe(401);
  });

  it("rejects an invalid API key (401)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/accounts",
      headers: { authorization: "Bearer wac_live_bogus" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("lists the client's accounts with a valid key (200)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/accounts",
      headers: { authorization: `Bearer ${apiKey}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.some((a: { id: string }) => a.id === accountId)).toBe(true);
  });

  it("sends a message (201)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/messages",
      headers: { authorization: `Bearer ${apiKey}` },
      payload: { accountId, to: "15551239999", type: "text", content: { body: "hi from test" } },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().status).toBe("SENT");
  });

  it("enforces tenant isolation across clients (403)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/messages",
      headers: { authorization: `Bearer ${apiKey}` },
      payload: { accountId: otherAccountId, to: "15551230000", type: "text", content: { body: "x" } },
    });
    expect(res.statusCode).toBe(403);
  });

  it("serves the OpenAPI spec with the documented paths", async () => {
    const res = await app.inject({ method: "GET", url: "/docs/json" });
    expect(res.statusCode).toBe(200);
    const paths = Object.keys(res.json().paths);
    expect(paths).toContain("/api/v1/messages");
    expect(paths).toContain("/api/v1/billing/invoices");
  });
});
