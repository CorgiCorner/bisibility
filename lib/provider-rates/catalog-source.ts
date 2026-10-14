import { createCatalog, serpapi } from "@usagekit/providers";
import { createDataForSeoLocalModule } from "./dataforseo-finder-module";

/** Shared immutable provider definitions for browser estimates and server admission. */
export const nativeProviderCatalog = createCatalog({
  providers: [createDataForSeoLocalModule(), serpapi],
  enabled: ["dataforseo", "serpapi"],
});
