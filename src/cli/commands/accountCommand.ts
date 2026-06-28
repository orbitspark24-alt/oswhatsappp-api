import { Command } from "commander";
import { registerTool, Tool } from "../../modules/Tool";
import { AccountService } from "../../services/AccountService";
import { ui, runAction } from "../ui";

const accountTool: Tool = {
  name: "account",
  description: "Provision and manage WhatsApp accounts",

  register(program: Command) {
    const group = program.command("account").description(this.description);

    group
      .command("provision")
      .description("Provision a WhatsApp account under a client")
      .requiredOption("--client <clientId>", "Owning client ID")
      .requiredOption("--waba-id <wabaId>", "WhatsApp Business Account ID")
      .requiredOption("--phone-number-id <id>", "Meta phone number ID")
      .requiredOption("--access-token <token>", "Access token (stored encrypted)")
      .option("--provider <provider>", "CLOUD_API | MOCK", "CLOUD_API")
      .option("--verify-token <token>", "Webhook verify token (stored encrypted)")
      .option("--app-secret <secret>", "App secret for webhook signature validation (encrypted)")
      .action(
        runAction(async (opts) => {
          const account = await AccountService.provision({
            clientId: opts.client,
            wabaId: opts.wabaId,
            phoneNumberId: opts.phoneNumberId,
            accessToken: opts.accessToken,
            provider: opts.provider,
            webhookVerifyToken: opts.verifyToken,
            appSecret: opts.appSecret,
          });
          ui.success(`Provisioned account ${account.id} (status: ${account.status})`);
          ui.info("Run `account health-check " + account.id + "` to verify and activate it.");
        })
      );

    group
      .command("list")
      .description("List WhatsApp accounts")
      .option("--client <clientId>", "Filter by client")
      .option("--status <status>", "Filter by status")
      .action(
        runAction(async (opts) => {
          const accounts = await AccountService.list({ clientId: opts.client, status: opts.status });
          ui.heading(`WhatsApp accounts (${accounts.length})`);
          ui.table(
            accounts.map((a) => ({
              ID: a.id,
              Client: (a as { client?: { name: string } }).client?.name ?? a.clientId,
              Provider: a.provider,
              PhoneNumberID: a.phoneNumberId,
              Status: a.status,
              Health: a.healthStatus,
            })),
            ["ID", "Client", "Provider", "PhoneNumberID", "Status", "Health"]
          );
        })
      );

    group
      .command("show <accountId>")
      .description("Show a single account (no secrets are displayed)")
      .action(
        runAction(async (accountId) => {
          const a = await AccountService.getById(accountId);
          ui.keyValue({
            ID: a.id,
            Client: a.clientId,
            Provider: a.provider,
            WABA: a.wabaId,
            PhoneNumberID: a.phoneNumberId,
            DisplayNumber: a.displayPhoneNumber,
            VerifiedName: a.verifiedName,
            Status: a.status,
            Health: a.healthStatus,
            LastHealthCheck: a.lastHealthCheckAt,
          });
        })
      );

    group
      .command("health-check <accountId>")
      .description("Ping the provider to confirm the number is live and the token valid")
      .action(
        runAction(async (accountId) => {
          const { account, result } = await AccountService.healthCheck(accountId);
          if (result.healthy) {
            ui.success(`Account ${accountId} is HEALTHY (status: ${account.status})`);
            ui.keyValue({
              DisplayNumber: result.displayPhoneNumber,
              VerifiedName: result.verifiedName,
              QualityRating: result.qualityRating,
            });
          } else {
            ui.error(`Account ${accountId} is UNHEALTHY: ${result.error}`);
          }
        })
      );

    group
      .command("suspend <accountId>")
      .description("Suspend an account")
      .action(
        runAction(async (accountId) => {
          await AccountService.suspend(accountId);
          ui.success(`Account ${accountId} suspended`);
        })
      );

    group
      .command("resume <accountId>")
      .description("Resume a suspended account")
      .action(
        runAction(async (accountId) => {
          await AccountService.resume(accountId);
          ui.success(`Account ${accountId} resumed`);
        })
      );

    group
      .command("deprovision <accountId>")
      .description("Deprovision an account")
      .action(
        runAction(async (accountId) => {
          await AccountService.deprovision(accountId);
          ui.success(`Account ${accountId} deprovisioned`);
        })
      );
  },
};

registerTool(accountTool);
export default accountTool;
