import { Command } from "commander";

// A Tool is a self-contained CLI feature module (a command group). Adding a new tool means
// creating a module that implements this interface and calls registerTool() at import time —
// the CLI core (src/cli/index.ts) iterates the registry and never references tools by name.
export interface Tool {
  /** Command group name, e.g. "client", "account", "billing". */
  name: string;
  description: string;
  /** Attach this tool's commands/subcommands onto the root commander program. */
  register(program: Command): void;
}

const registry = new Map<string, Tool>();

export function registerTool(tool: Tool): void {
  if (registry.has(tool.name)) {
    throw new Error(`Tool "${tool.name}" is already registered.`);
  }
  registry.set(tool.name, tool);
}

export function getTools(): Tool[] {
  return [...registry.values()].sort((a, b) => a.name.localeCompare(b.name));
}
