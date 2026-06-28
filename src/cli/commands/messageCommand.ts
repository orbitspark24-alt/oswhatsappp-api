import { Command } from "commander";
import { registerTool, Tool } from "../../modules/Tool";
import { MessageService } from "../../services/MessageService";
import { ui, runAction } from "../ui";

const messageTool: Tool = {
  name: "message",
  description: "Send messages and query conversation logs",

  register(program: Command) {
    const group = program.command("message").description(this.description);

    group
      .command("send-text")
      .description("Send a text message")
      .requiredOption("--account <accountId>")
      .requiredOption("--to <number>", "Recipient (E.164, no +)")
      .requiredOption("--body <text>")
      .option("--preview-url", "Enable link preview", false)
      .action(
        runAction(async (opts) => {
          const msg = await MessageService.sendText(opts.account, opts.to, opts.body, !!opts.previewUrl);
          ui.success(`Sent message ${msg.id} (status: ${msg.status}, wamid: ${msg.waMessageId ?? "—"})`);
        })
      );

    group
      .command("send")
      .description("Send any message type with a raw content JSON object")
      .requiredOption("--account <accountId>")
      .requiredOption("--to <number>")
      .requiredOption("--type <type>", "text|image|video|document|audio|location|contacts|interactive|template")
      .requiredOption("--content <json>", "Type-specific content as JSON")
      .action(
        runAction(async (opts) => {
          const msg = await MessageService.send(opts.account, {
            to: opts.to,
            type: opts.type,
            content: JSON.parse(opts.content),
          });
          ui.success(`Sent ${opts.type} message ${msg.id} (status: ${msg.status})`);
        })
      );

    group
      .command("log <accountId>")
      .description("Show conversation log for an account")
      .option("--contact <number>", "Filter to one contact number")
      .option("--limit <n>", "Max messages", "30")
      .action(
        runAction(async (accountId, opts) => {
          const messages = await MessageService.list(accountId, {
            contact: opts.contact,
            take: Number(opts.limit),
          });
          ui.heading(`Conversation log (${messages.length})`);
          ui.table(
            messages.map((m) => ({
              When: m.createdAt,
              Dir: m.direction,
              Type: m.type,
              From: m.fromNumber,
              To: m.toNumber,
              Status: m.status,
            })),
            ["When", "Dir", "Type", "From", "To", "Status"]
          );
        })
      );
  },
};

registerTool(messageTool);
export default messageTool;
