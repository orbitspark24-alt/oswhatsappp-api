import { Command } from "commander";
import { registerTool, Tool } from "../../modules/Tool";
import { ClientService } from "../../services/ClientService";
import { ui, runAction } from "../ui";

const clientTool: Tool = {
  name: "client",
  description: "Manage reseller clients",

  register(program: Command) {
    const group = program.command("client").description(this.description);

    group
      .command("create")
      .description("Create a new client")
      .requiredOption("--name <name>", "Client contact name")
      .requiredOption("--email <email>", "Client email (unique)")
      .option("--company <company>", "Company name")
      .option("--phone <phone>", "Contact phone")
      .action(
        runAction(async (opts) => {
          const client = await ClientService.create({
            name: opts.name,
            email: opts.email,
            companyName: opts.company,
            phone: opts.phone,
          });
          ui.success(`Created client ${client.id}`);
          ui.keyValue({
            ID: client.id,
            Name: client.name,
            Email: client.email,
            Company: client.companyName,
            Status: client.status,
          });
        })
      );

    group
      .command("list")
      .description("List clients")
      .option("--status <status>", "Filter by status (ACTIVE | SUSPENDED | CANCELLED)")
      .action(
        runAction(async (opts) => {
          const clients = await ClientService.list({ status: opts.status });
          ui.heading(`Clients (${clients.length})`);
          ui.table(
            clients.map((c) => ({
              ID: c.id,
              Name: c.name,
              Email: c.email,
              Status: c.status,
              Accounts: (c as { _count?: { whatsappAccounts: number } })._count?.whatsappAccounts ?? 0,
              Created: c.createdAt,
            })),
            ["ID", "Name", "Email", "Status", "Accounts", "Created"]
          );
        })
      );

    group
      .command("show <clientId>")
      .description("Show a single client")
      .action(
        runAction(async (clientId) => {
          const client = await ClientService.getById(clientId);
          ui.keyValue({
            ID: client.id,
            Name: client.name,
            Email: client.email,
            Company: client.companyName,
            Phone: client.phone,
            Status: client.status,
            Created: client.createdAt,
          });
        })
      );

    group
      .command("update <clientId>")
      .description("Update client fields")
      .option("--name <name>")
      .option("--email <email>")
      .option("--company <company>")
      .option("--phone <phone>")
      .action(
        runAction(async (clientId, opts) => {
          const client = await ClientService.update(clientId, {
            name: opts.name,
            email: opts.email,
            companyName: opts.company,
            phone: opts.phone,
          });
          ui.success(`Updated client ${client.id}`);
        })
      );

    group
      .command("suspend <clientId>")
      .description("Suspend a client")
      .action(
        runAction(async (clientId) => {
          await ClientService.setStatus(clientId, "SUSPENDED");
          ui.success(`Client ${clientId} suspended`);
        })
      );

    group
      .command("activate <clientId>")
      .description("Re-activate a client")
      .action(
        runAction(async (clientId) => {
          await ClientService.setStatus(clientId, "ACTIVE");
          ui.success(`Client ${clientId} activated`);
        })
      );

    group
      .command("delete <clientId>")
      .description("Delete a client and all their data")
      .action(
        runAction(async (clientId) => {
          await ClientService.delete(clientId);
          ui.success(`Client ${clientId} deleted`);
        })
      );
  },
};

registerTool(clientTool);
export default clientTool;
