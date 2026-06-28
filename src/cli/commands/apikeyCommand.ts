import { Command } from "commander";
import { registerTool, Tool } from "../../modules/Tool";
import { ApiKeyService } from "../../services/ApiKeyService";
import { ui, runAction } from "../ui";

const apikeyTool: Tool = {
  name: "apikey",
  description: "Issue and manage per-client public API keys",

  register(program: Command) {
    const group = program.command("apikey").description(this.description);

    group
      .command("create")
      .description("Issue a new API key for a client (shown once)")
      .requiredOption("--client <clientId>")
      .option("--scopes <list>", "Comma-separated scopes, or * for all", "*")
      .action(
        runAction(async (opts) => {
          const scopes = String(opts.scopes).split(",").map((s: string) => s.trim());
          const result = await ApiKeyService.create(opts.client, scopes);
          ui.success("API key created — save it now, it will not be shown again:");
          ui.keyValue({ ID: result.id, Key: result.key, Scopes: result.scopes.join(", ") });
        })
      );

    group
      .command("list <clientId>")
      .description("List a client's API keys (hashes never shown)")
      .action(
        runAction(async (clientId) => {
          const keys = await ApiKeyService.listByClient(clientId);
          ui.heading(`API keys (${keys.length})`);
          ui.table(
            keys.map((k) => ({
              ID: k.id,
              Prefix: k.prefix + "…",
              Status: k.status,
              LastUsed: k.lastUsedAt,
              Created: k.createdAt,
            })),
            ["ID", "Prefix", "Status", "LastUsed", "Created"]
          );
        })
      );

    group
      .command("revoke <apiKeyId>")
      .description("Revoke an API key")
      .action(
        runAction(async (id) => {
          await ApiKeyService.revoke(id);
          ui.success(`API key ${id} revoked`);
        })
      );

    group
      .command("rotate <apiKeyId>")
      .description("Revoke and reissue a key, preserving scopes")
      .action(
        runAction(async (id) => {
          const result = await ApiKeyService.rotate(id);
          ui.success("Rotated — new key (shown once):");
          ui.keyValue({ ID: result.id, Key: result.key, Scopes: result.scopes.join(", ") });
        })
      );
  },
};

registerTool(apikeyTool);
export default apikeyTool;
