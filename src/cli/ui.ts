import chalk from "chalk";
import Table from "cli-table3";
import { ServiceError } from "../services/errors";

export const ui = {
  success(msg: string) {
    console.log(chalk.green("✔ ") + msg);
  },
  info(msg: string) {
    console.log(chalk.cyan("ℹ ") + msg);
  },
  warn(msg: string) {
    console.log(chalk.yellow("⚠ ") + msg);
  },
  error(msg: string) {
    console.error(chalk.red("✖ ") + msg);
  },
  heading(msg: string) {
    console.log("\n" + chalk.bold.underline(msg));
  },

  // Renders an array of row objects as a table using the given column keys.
  table(rows: Array<Record<string, unknown>>, columns: string[]) {
    if (rows.length === 0) {
      console.log(chalk.dim("  (no records)"));
      return;
    }
    const table = new Table({ head: columns.map((c) => chalk.bold(c)) });
    for (const row of rows) {
      table.push(columns.map((c) => formatCell(row[c])));
    }
    console.log(table.toString());
  },

  keyValue(obj: Record<string, unknown>) {
    const table = new Table();
    for (const [k, v] of Object.entries(obj)) {
      table.push({ [chalk.bold(k)]: formatCell(v) });
    }
    console.log(table.toString());
  },
};

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return chalk.dim("—");
  if (value instanceof Date) return value.toISOString().replace("T", " ").slice(0, 19);
  if (typeof value === "boolean") return value ? chalk.green("yes") : chalk.red("no");
  return String(value);
}

// Wraps a command action so service errors print cleanly and exit non-zero,
// while unexpected errors still surface a stack for debugging.
export function runAction<T extends unknown[]>(
  fn: (...args: T) => Promise<void>
): (...args: T) => Promise<void> {
  return async (...args: T) => {
    try {
      await fn(...args);
    } catch (err) {
      if (err instanceof ServiceError) {
        ui.error(err.message);
      } else if (err instanceof Error) {
        ui.error(err.message);
        if (process.env.DEBUG) console.error(err.stack);
      } else {
        ui.error(String(err));
      }
      process.exitCode = 1;
    }
  };
}
