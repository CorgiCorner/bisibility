import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("../../", import.meta.url)),
      "server-only": fileURLToPath(new URL("../config/vitest.empty.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/ai-tracking/*.integration.test.ts"],
    pool: "forks",
  },
});
