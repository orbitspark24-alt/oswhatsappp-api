import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // Integration tests share one SQLite test DB; run serially to avoid write contention.
    fileParallelism: false,
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.test.ts"],
    hookTimeout: 60000,
    testTimeout: 30000,
  },
});
