import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const src = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\//, replacement: `${src}/` },
      // `server-only` throws outside React Server Components; tests are server code.
      {
        find: "server-only",
        replacement: fileURLToPath(new URL("./tests/support/empty.ts", import.meta.url)),
      },
    ],
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    setupFiles: ["./tests/support/env.ts"],
    globalSetup: ["./tests/support/global-setup.ts"],
    // Integration tests share one database; run files sequentially.
    fileParallelism: false,
    coverage: {
      provider: "v8",
      include: ["src/server/sync/**", "src/server/billing/**", "src/server/jobs/**", "src/server/crypto/**"],
      exclude: ["**/*.test.ts"],
    },
  },
});
