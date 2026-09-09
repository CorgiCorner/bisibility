import type { RankedKeywordsPage } from "@/components/onboarding/steps/keyword-ranked-model";

const connection = { id: "conn_storybook", label: "DataForSEO", provider: "dataforseo" };
export async function listKeywordSuggestionSources() {
  return { domain: "acme.dev", searchConsole: true, rankedConnections: [connection] };
}
export async function importTopQueries() {
  const suggestions = [
    { query: "rank tracker", clicks: 120, impressions: 1800 },
    { query: "keyword monitoring", clicks: 65, impressions: 900 },
    { query: "seo reporting", clicks: 32, impressions: 720 },
  ];
  return { queries: suggestions.map(({ query }) => query), suggestions, hidden: [] };
}
export async function fetchRankedKeywordSuggestions(): Promise<RankedKeywordsPage> {
  return {
    cached: false,
    connections: [connection],
    costCents: 2,
    fetchedAt: "2026-09-08T00:00:00.000Z",
    offset: 0,
    totalCount: 2,
    rows: [
      {
        keyword: "rank tracking api",
        alreadyTracked: true,
        position: 3,
        searchVolume: 2400,
        estimatedTraffic: 180,
      },
      {
        keyword: "open source seo tools",
        alreadyTracked: false,
        position: 7,
        searchVolume: 800,
        estimatedTraffic: 45,
      },
    ],
  };
}
