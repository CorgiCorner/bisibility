import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      {
        find: "server-only",
        replacement: fileURLToPath(new URL("./vitest.empty.ts", import.meta.url)),
      },
      { find: /^@\//, replacement: fileURLToPath(new URL("../../", import.meta.url)) },
    ],
  },
  test: {
    environment: "node",
    include: ["lib/metering/**/*.integration.test.ts"],
    testTimeout: 180000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
});
