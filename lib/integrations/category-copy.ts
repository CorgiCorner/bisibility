import type { ProviderKind } from "@/lib/providers/types";

export type ActiveIntegrationKind = Extract<ProviderKind, "analytics" | "serp" | "enrichment">;

export type IntegrationCategoryCopy = {
  description: string;
  eyebrow: string;
  title: string;
};

export const SERP_INTEGRATION_CATEGORY_COPY = {
  description: "Connect data providers for rank tracking, SEO research and domain metrics.",
  eyebrow: "Rankings, research and domain metrics",
  title: "SEO data",
} satisfies IntegrationCategoryCopy;

export const ANALYTICS_INTEGRATION_CATEGORY_COPY = {
  description:
    "Connect owned-data sources such as Google Search Console or Google Analytics 4 to add traffic and query performance context. Analytics sources are not used to determine rank positions.",
  eyebrow: "Owned-data performance context",
  title: "Analytics sources",
} satisfies IntegrationCategoryCopy;

export const INTEGRATION_CATEGORY_COPY = {
  enrichment: {
    description: "Track your domain's backlink authority with daily Domain Rating observations.",
    eyebrow: "Domain authority",
    title: "SEO enrichment",
  },
  analytics: ANALYTICS_INTEGRATION_CATEGORY_COPY,
  serp: SERP_INTEGRATION_CATEGORY_COPY,
} satisfies Record<ActiveIntegrationKind, IntegrationCategoryCopy>;
