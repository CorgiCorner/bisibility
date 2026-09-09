import type { Plugin } from "vite";

export function testModuleCache(): Plugin {
  return {
    name: "test-module-cache",
    configureVitest({ defineCacheKeyGenerator }) {
      // Keep setup and mock registration outside the persistent application cache.
      defineCacheKeyGenerator(({ id }) =>
        /\/vitest\.setup(?:\.[^/]*)?\.ts$/.test(id) ? false : undefined,
      );
    },
  };
}
