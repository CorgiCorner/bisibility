import { createCatalog, serpapi } from "@usagekit/providers";
import { createDataForSeoMapsModule } from "./dataforseo-maps-module";

/** Shared immutable provider definitions for browser estimates and server admission. */
export const nativeProviderCatalog = createCatalog({
  providers: [createDataForSeoMapsModule(), serpapi],
  enabled: ["dataforseo", "serpapi"],
});
