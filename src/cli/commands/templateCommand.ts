import { Command } from "commander";
import { registerTool, Tool } from "../../modules/Tool";
import { TemplateService } from "../../services/TemplateService";
import { ui, runAction } from "../ui";

const templateTool: Tool = {
  name: "template",
  description: "Create, submit, and send WhatsApp message templates",

  register(program: Command) {
    const group = program.command("template").description(this.description);

    group
      .command("create")
      .description("Create a template and submit it to Meta for approval")
      .requiredOption("--account <accountId>")
      .requiredOption("--name <name>")
      .requiredOption("--language <code>", "e.g. en_US")
      .requiredOption("--category <category>", "MARKETING | UTILITY | AUTHENTICATION")
      .requiredOption("--components <json>", "Meta components array as JSON")
      .action(
        runAction(async (opts) => {
          const t = await TemplateService.create({
            accountId: opts.account,
            name: opts.name,
            language: opts.language,
            category: opts.category,
            components: JSON.parse(opts.components),
          });
          ui.success(`Created template ${t.name} (${t.id}) — status ${t.status}`);
        })
      );

    group
      .command("list <accountId>")
      .description("List templates for an account")
      .action(
        runAction(async (accountId) => {
          const templates = await TemplateService.list(accountId);
          ui.heading(`Templates (${templates.length})`);
          ui.table(
            templates.map((t) => ({
              ID: t.id,
              Name: t.name,
              Lang: t.language,
              Category: t.category,
              Status: t.status,
            })),
            ["ID", "Name", "Lang", "Category", "Status"]
          );
        })
      );

    group
      .command("sync <accountId>")
      .description("Sync approval statuses from Meta")
      .action(
        runAction(async (accountId) => {
          const r = await TemplateService.syncStatuses(accountId);
          ui.success(`Synced — ${r.fetched} fetched, ${r.updated} updated`);
        })
      );

    group
      .command("send <templateId>")
      .description("Send an approved template message")
      .requiredOption("--to <number>", "Recipient (E.164, no +)")
      .option("--vars <json>", "Body variables as a JSON array of strings", "[]")
      .action(
        runAction(async (templateId, opts) => {
          const msg = await TemplateService.send(templateId, opts.to, JSON.parse(opts.vars));
          ui.success(`Sent template message ${msg.id} (status: ${msg.status})`);
        })
      );
  },
};

registerTool(templateTool);
export default templateTool;
