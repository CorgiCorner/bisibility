import type { Plugin } from "vite";

export function testModuleCache(): Plugin {
  return {
    name: "test-module-cache",
    configureVitest({ defineCacheKeyGenerator }) {
      // Re-resolve mocked Nodemailer CJS exports in each worker; cache other application modules.
      defineCacheKeyGenerator(({ id, sourceCode }) =>
        /\/vitest\.setup(?:\.[^/]*)?\.ts$/.test(id) ||
        /\bfrom\s+["']nodemailer["']/.test(sourceCode)
          ? false
          : undefined,
      );
    },
  };
}
