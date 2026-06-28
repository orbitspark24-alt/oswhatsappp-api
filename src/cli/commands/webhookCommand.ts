import { Command } from "commander";
import { registerTool, Tool } from "../../modules/Tool";
import { WebhookService, WebhookPayload } from "../../services/WebhookService";
import { ui, runAction } from "../ui";

const webhookTool: Tool = {
  name: "webhook",
  description: "Inspect and simulate inbound webhook events",

  register(program: Command) {
    const group = program.command("webhook").description(this.description);

    group
      .command("recent")
      .description("Show recently received inbound messages")
      .option("--limit <n>", "Max entries", "20")
      .action(
        runAction(async (opts) => {
          const messages = await WebhookService.recentInbound(Number(opts.limit));
          ui.heading(`Recent inbound (${messages.length})`);
          ui.table(
            messages.map((m) => ({
              When: m.createdAt,
              From: m.fromNumber,
              Type: m.type,
              Status: m.status,
            })),
            ["When", "From", "Type", "Status"]
          );
        })
      );

    // Feeds a webhook JSON payload through the processor without HTTP — for local testing of
    // inbound handling (the real receiver is `npm run webhook`).
    group
      .command("simulate")
      .description("Process a webhook payload from a JSON string (skips signature check)")
      .requiredOption("--payload <json>", "Meta webhook payload JSON")
      .action(
        runAction(async (opts) => {
          const result = await WebhookService.processEvent(JSON.parse(opts.payload) as WebhookPayload);
          ui.success(`Processed — ${result.inbound} inbound, ${result.statuses} status update(s)`);
        })
      );
  },
};

registerTool(webhookTool);
export default webhookTool;
