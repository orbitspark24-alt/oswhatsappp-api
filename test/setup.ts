import { execSync } from "child_process";
import * as path from "path";
import * as fs from "fs";

// Isolate tests from the dev database: point at a dedicated SQLite file and ensure the
// encryption key exists before any service/prisma module loads. setupFiles run before the
// test modules are imported, so env set here is visible to the prisma client singleton.
const TEST_DB_PATH = path.join(__dirname, "test.db");
process.env.DATABASE_URL = `file:${TEST_DB_PATH}`;
process.env.DB_PROVIDER = "sqlite";
process.env.NODE_ENV = "test";
if (!process.env.ENCRYPTION_KEY) {
  // Deterministic 32-byte key for tests.
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
}

// Create a fresh schema in the test DB once per run.
if (fs.existsSync(TEST_DB_PATH)) fs.rmSync(TEST_DB_PATH);
execSync("npx prisma db push --skip-generate --accept-data-loss", {
  cwd: path.join(__dirname, ".."),
  env: process.env,
  stdio: "ignore",
});
