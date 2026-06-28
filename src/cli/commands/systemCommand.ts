import { Command } from "commander";
import { registerTool, Tool, getTools } from "../../modules/Tool";
import { prisma } from "../../db/prisma";
import { config } from "../../config";
import { ui, runAction } from "../ui";

const systemTool: Tool = {
  name: "system",
  description: "Platform diagnostics and metadata",

  register(program: Command) {
    const group = program.command("system").description(this.description);

    group
      .command("status")
      .description("Show platform/database status")
      .action(
        runAction(async () => {
          const [clients, accounts, plans] = await Promise.all([
            prisma.client.count(),
            prisma.whatsAppAccount.count(),
            prisma.plan.count(),
          ]);
          ui.heading("System status");
          ui.keyValue({
            DBProvider: config.db.provider,
            GraphAPIVersion: config.meta.graphApiVersion,
            Clients: clients,
            WhatsAppAccounts: accounts,
            Plans: plans,
            RegisteredTools: getTools().length,
          });
        })
      );

    group
      .command("tools")
      .description("List registered tool modules (plugin registry)")
      .action(
        runAction(async () => {
          ui.heading("Registered tools");
          ui.table(
            getTools().map((t) => ({ Tool: t.name, Description: t.description })),
            ["Tool", "Description"]
          );
        })
      );

    group
      .command("audit")
      .description("Show recent audit log entries")
      .option("--limit <n>", "How many entries", "20")
      .action(
        runAction(async (opts) => {
          const entries = await prisma.auditLog.findMany({
            orderBy: { createdAt: "desc" },
            take: Number(opts.limit),
          });
          ui.heading(`Audit log (latest ${entries.length})`);
          ui.table(
            entries.map((e) => ({
              When: e.createdAt,
              Actor: e.actorType,
              Action: e.action,
              Target: e.targetId ? `${e.targetType}:${e.targetId}` : "—",
            })),
            ["When", "Actor", "Action", "Target"]
          );
        })
      );
  },
};

registerTool(systemTool);
export default systemTool;
