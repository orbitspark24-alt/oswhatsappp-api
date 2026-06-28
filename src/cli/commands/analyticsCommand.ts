import { Command } from "commander";
import { registerTool, Tool } from "../../modules/Tool";
import { AnalyticsService } from "../../services/AnalyticsService";
import { BroadcastService, BroadcastRecipient } from "../../services/BroadcastService";
import { ui, runAction } from "../ui";

const analyticsTool: Tool = {
  name: "analytics",
  description: "Per-client dashboards and bulk broadcasts",

  register(program: Command) {
    const group = program.command("analytics").description(this.description);

    group
      .command("client <clientId>")
      .description("Show messaging/quota/cost analytics for a client")
      .action(
        runAction(async (clientId) => {
          const a = await AnalyticsService.forClient(clientId);
          ui.heading(`Analytics — ${a.clientName}`);
          ui.table(
            a.accounts.map((acc) => ({
              Account: acc.phoneNumberId,
              Status: acc.status,
              Sent: acc.messages.sent,
              Delivered: acc.messages.delivered,
              Read: acc.messages.read,
              Failed: acc.messages.failed,
              Inbound: acc.messages.inbound,
              Quota: acc.quota ? `${acc.quota.used}/${acc.quota.quota}` : "—",
            })),
            ["Account", "Status", "Sent", "Delivered", "Read", "Failed", "Inbound", "Quota"]
          );
          ui.keyValue({
            "Total Sent": a.totals.sent,
            "Total Delivered": a.totals.delivered,
            "Total Read": a.totals.read,
            "Total Failed": a.totals.failed,
            "Total Inbound": a.totals.inbound,
          });
        })
      );

    // Broadcast lives here alongside analytics since they share the audience/reporting concern.
    group
      .command("broadcast <templateId>")
      .description("Rate-limited bulk send of an approved template")
      .requiredOption("--recipients <json>", 'JSON array, e.g. [{"to":"15551112222","variables":["A1"]}]')
      .action(
        runAction(async (templateId, opts) => {
          const recipients = JSON.parse(opts.recipients) as BroadcastRecipient[];
          const summary = await BroadcastService.broadcastTemplate(templateId, recipients);
          ui.success(`Broadcast complete — ${summary.sent}/${summary.total} sent, ${summary.failed} failed`);
          if (summary.errors.length) {
            ui.warn("Failures:");
            ui.table(summary.errors, ["to", "error"]);
          }
        })
      );
  },
};

registerTool(analyticsTool);
export default analyticsTool;
