import { createCatalog, dataforseo, serpapi } from "@usagekit/providers";

/** Shared immutable provider definitions for browser estimates and server admission. */
export const nativeProviderCatalog = createCatalog({
  providers: [dataforseo, serpapi],
  enabled: ["dataforseo", "serpapi"],
});
