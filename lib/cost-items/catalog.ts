import { PROVIDER_CATALOG } from "@/lib/providers/catalog-metadata";
import type { ProviderCatalogEntry } from "@/lib/providers/types";

export type CostKind = "ai" | "analytics" | "custom" | "seo_tool";
export type CostCatalogEntry = {
  key: string;
  kind: CostKind;
  logoDomain: string | null;
  name: string;
  plans: readonly string[];
};

const providerKind: Partial<Record<ProviderCatalogEntry["kind"], CostKind>> = {
  analytics: "analytics",
  enrichment: "seo_tool",
  serp: "seo_tool",
};

const providerPlans: Record<string, readonly string[]> = {
  ahrefs: ["Lite", "Standard", "Advanced"],
  dataforseo: ["Pay as you go"],
  ga4: ["Free"],
  gsc: ["Free"],
  plausible: ["Growth"],
  serpapi: ["Free", "Starter", "Production"],
};

/** Names and typical plan labels only. Amounts are entered by the user. */
const EXTRA_CATALOG: readonly CostCatalogEntry[] = [
  {
    key: "semrush",
    kind: "seo_tool",
    logoDomain: "semrush.com",
    name: "Semrush",
    plans: ["Pro", "Guru", "Business"],
  },
  {
    key: "surfer",
    kind: "seo_tool",
    logoDomain: "surferseo.com",
    name: "Surfer",
    plans: ["Essential", "Scale"],
  },
  {
    key: "chatgpt",
    kind: "ai",
    logoDomain: "openai.com",
    name: "ChatGPT",
    plans: ["Plus", "Pro"],
  },
  {
    key: "claude",
    kind: "ai",
    logoDomain: "claude.com",
    name: "Claude",
    plans: ["Pro", "Team"],
  },
];

export function costCatalog(): CostCatalogEntry[] {
  const fromProviders = PROVIDER_CATALOG.flatMap((entry) => {
    const kind = providerKind[entry.kind];
    if (!kind || entry.id === "local-sequence") return [];
    return [
      {
        key: entry.id,
        kind,
        logoDomain: entry.logoDomain ?? null,
        name: entry.label,
        plans: providerPlans[entry.id] ?? [],
      },
    ];
  });
  const seen = new Set<string>(fromProviders.map((entry) => entry.key));
  return [...fromProviders, ...EXTRA_CATALOG.filter((entry) => !seen.has(entry.key))];
}
