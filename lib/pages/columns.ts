import type { ProjectPageColumnSource } from "./types";

export type PageColumnFacts = {
  aiCitations: number;
  aiPages: number;
  checked: number;
  ga4Pages: number;
  keywords: number;
  listed: number;
  monthsStored: number;
  plausiblePages: number;
  presenceTotal: number;
  prompts: number;
  rankPages: number;
  searchConsolePages: number;
};

export type PageColumnConnections = {
  aiConnected: boolean;
  ga4Connected: boolean;
  gscConnected: boolean;
  pagespeedConnected: boolean;
  plausibleConnected: boolean;
  rankConnected: boolean;
  sitemapEnabled: boolean;
};

function count(value: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function projectPageColumnSources(
  facts: PageColumnFacts,
  connections: PageColumnConnections,
): ProjectPageColumnSource[] {
  const analytics = connections.ga4Connected
    ? { note: "GA4", pages: count(facts.ga4Pages), state: "connected" as const }
    : connections.plausibleConnected
      ? { note: "Plausible", pages: count(facts.plausiblePages), state: "connected" as const }
      : { note: "", pages: 0, state: "not_connected" as const };
  return [
    {
      kind: "sitemap",
      note: "",
      pages: count(facts.listed),
      state: connections.sitemapEnabled ? "connected" : "not_connected",
    },
    {
      kind: "page_indexing",
      note: `${count(facts.checked)} checked of ${count(facts.presenceTotal)}`,
      pages: count(facts.presenceTotal),
      state: connections.gscConnected ? "beta" : "not_connected",
    },
    {
      kind: "search_console",
      note: connections.gscConnected ? `${count(facts.monthsStored)} months stored` : "",
      pages: count(facts.searchConsolePages),
      state: connections.gscConnected ? "connected" : "not_connected",
    },
    {
      kind: "pagespeed",
      note: "",
      pages: 0,
      state: connections.pagespeedConnected ? "connected" : "not_connected",
    },
    { kind: "analytics", ...analytics },
    {
      kind: "rank_tracker",
      note: `${count(facts.rankPages)} target URLs, ${count(facts.keywords)} keywords`,
      pages: count(facts.rankPages),
      state: connections.rankConnected ? "connected" : "not_connected",
    },
    {
      kind: "ai_visibility",
      note: `${count(facts.prompts)} prompts, ${count(facts.aiCitations)} citations`,
      pages: count(facts.aiPages),
      state: connections.aiConnected ? "connected" : "not_connected",
    },
  ];
}
