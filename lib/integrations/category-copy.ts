import type { ProviderKind } from "@/lib/providers/types";

export type ActiveIntegrationKind = Extract<ProviderKind, "analytics" | "serp">;

export type IntegrationCategoryCopy = {
  description: string;
  eyebrow: string;
  title: string;
};

export const SERP_INTEGRATION_CATEGORY_COPY = {
  description:
    "Connect providers that run Google rank checks for tracked keywords. Enabled providers form a priority-ordered fallback chain, and you pay each provider directly.",
  eyebrow: "Google rank checks - priority fallback",
  title: "SERP providers",
} satisfies IntegrationCategoryCopy;

export const ANALYTICS_INTEGRATION_CATEGORY_COPY = {
  description:
    "Connect owned-data sources such as Google Search Console or Google Analytics 4 to add traffic and query performance context. Analytics sources are not used to determine rank positions.",
  eyebrow: "Owned-data performance context",
  title: "Analytics sources",
} satisfies IntegrationCategoryCopy;

export const INTEGRATION_CATEGORY_COPY = {
  analytics: ANALYTICS_INTEGRATION_CATEGORY_COPY,
  serp: SERP_INTEGRATION_CATEGORY_COPY,
} satisfies Record<ActiveIntegrationKind, IntegrationCategoryCopy>;
