import * as fs from "fs";
import * as path from "path";

// Auto-discovers command modules so the CLI core never hard-codes the tool list.
// Any file in cli/commands/ named "*Command.{ts,js}" is required, which triggers its
// registerTool() call at import time. Drop in a new tool file → it appears in the CLI.
export function loadCommands(): void {
  const commandsDir = path.join(__dirname, "commands");
  if (!fs.existsSync(commandsDir)) return;

  const ext = __filename.endsWith(".ts") ? ".ts" : ".js";
  const files = fs
    .readdirSync(commandsDir)
    .filter((f) => f.endsWith(`Command${ext}`));

  for (const file of files) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require(path.join(commandsDir, file));
  }
}
