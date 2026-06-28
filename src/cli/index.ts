#!/usr/bin/env node
import { Command } from "commander";
import { loadCommands } from "./loadCommands";
import { getTools } from "../modules/Tool";
import { prisma } from "../db/prisma";

// CLI core. It knows nothing about specific commands — it discovers tool modules from the
// registry (populated by loadCommands) and lets each attach itself to the program. The same
// service layer these commands call also backs the REST API (step 6), so console and CRM stay in sync.
async function main() {
  const program = new Command();
  program
    .name("wac")
    .description("WhatsApp API Reseller Console — provision, meter, and bill WhatsApp accounts")
    .version("0.1.0");

  loadCommands();
  for (const tool of getTools()) {
    tool.register(program);
  }

  await program.parseAsync(process.argv);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
