import type { Plugin } from "vite";

export function testModuleCache(): Plugin {
  return {
    name: "test-module-cache",
    configureVitest({ defineCacheKeyGenerator }) {
      // Re-resolve mocked Nodemailer exports and the image-route glob as files change.
      defineCacheKeyGenerator(({ id, sourceCode }) =>
        /\/vitest\.setup(?:\.[^/]*)?\.ts$/.test(id) ||
        /\/page-og-routes\.test\.ts$/.test(id) ||
        /\bfrom\s+["']nodemailer["']/.test(sourceCode)
          ? false
          : undefined,
      );
    },
  };
}
