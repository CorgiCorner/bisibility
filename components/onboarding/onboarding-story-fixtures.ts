export const rankedKeywordConnection = {
  id: "conn_story_dataforseo",
  label: "DataForSEO",
  provider: "dataforseo",
};

export async function fetchRankedKeywordSuggestionsAction() {
  return {
    cached: false,
    connections: [rankedKeywordConnection],
    costCents: 2,
    fetchedAt: "2026-08-11T12:00:00.000Z",
    offset: 0,
    rows: [
      {
        alreadyTracked: false,
        estimatedTraffic: 42,
        keyword: "rank tracker",
        position: 3,
        searchVolume: 900,
      },
      {
        alreadyTracked: false,
        estimatedTraffic: 31,
        keyword: "seo api",
        position: 5,
        searchVolume: 600,
      },
      {
        alreadyTracked: false,
        estimatedTraffic: 18,
        keyword: "keyword monitoring",
        position: 8,
        searchVolume: 350,
      },
    ],
    totalCount: 3,
  };
}
