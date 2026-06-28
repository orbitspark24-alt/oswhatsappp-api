import { describe, it, expect } from "vitest";
import { ApiKeyService } from "../../src/services/ApiKeyService";

describe("ApiKeyService.hasScope", () => {
  it("wildcard grants everything", () => {
    expect(ApiKeyService.hasScope(["*"], "messages:write")).toBe(true);
  });
  it("exact scope match", () => {
    expect(ApiKeyService.hasScope(["messages:write", "templates:read"], "messages:write")).toBe(true);
  });
  it("denies missing scope", () => {
    expect(ApiKeyService.hasScope(["messages:read"], "messages:write")).toBe(false);
  });
  it("denies empty scopes", () => {
    expect(ApiKeyService.hasScope([], "anything")).toBe(false);
  });
});
