import { fetchPageSpeed, PageSpeedError } from "@/lib/pagespeed/client";
import type { AnalyticsProvider, ProviderCredentials } from "@/lib/providers/types";

export { fetchPageSpeed, PageSpeedError } from "@/lib/pagespeed/client";

export const pageSpeedAnalyticsProvider: AnalyticsProvider = {
  id: "pagespeed",
  label: "PageSpeed Insights",
  async testConnection(credentials: ProviderCredentials) {
    if (!credentials.apiKey) return { message: "An API key is required.", ok: false };
    try {
      await fetchPageSpeed("https://example.com/", "mobile", { apiKey: credentials.apiKey });
      return { message: "Connected.", ok: true };
    } catch (error) {
      return {
        message: error instanceof PageSpeedError ? error.code : "unreachable",
        ok: false,
      };
    }
  },
};
