import type { ProviderCredentials, SerpProvider } from "@/lib/providers/types";
import type { SerpRankLocation } from "@/lib/serp/location";
import {
  type DataForSeoResponse,
  dataForSeoKeywordIdeasPage,
  dataForSeoKeywordMetricsPage,
  dataForSeoKeywordSuggestionsPage,
  dataForSeoRelatedKeywordsPage,
} from "./dataforseo-payload";

const RELATED_URL = "https://api.dataforseo.com/v3/dataforseo_labs/google/related_keywords/live";
const SUGGESTIONS_URL =
  "https://api.dataforseo.com/v3/dataforseo_labs/google/keyword_suggestions/live";
const IDEAS_URL = "https://api.dataforseo.com/v3/dataforseo_labs/google/keyword_ideas/live";
const METRICS_URL = "https://api.dataforseo.com/v3/dataforseo_labs/google/keyword_overview/live";

type ResearchMethods = Pick<
  Required<SerpProvider>,
  "fetchKeywordIdeas" | "fetchKeywordMetrics" | "fetchKeywordSuggestions" | "fetchRelatedKeywords"
>;

type Dependencies = {
  locationParams: (location: SerpRankLocation) => object;
  request: (
    url: string,
    credentials: ProviderCredentials,
    payload: Record<string, unknown>,
  ) => Promise<DataForSeoResponse>;
};

export function createDataForSeoResearchMethods(deps: Dependencies): ResearchMethods {
  const fetchSource = async (
    url: string,
    credentials: ProviderCredentials,
    input: Parameters<ResearchMethods["fetchRelatedKeywords"]>[1],
    payload: Record<string, unknown>,
  ) =>
    deps.request(url, credentials, {
      ...deps.locationParams(input.location),
      include_clickstream_data: input.includeClickstream,
      limit: input.limit,
      ...payload,
    });

  return {
    async fetchRelatedKeywords(credentials, input) {
      const data = await fetchSource(RELATED_URL, credentials, input, {
        depth: 3,
        keyword: input.seed,
      });
      return dataForSeoRelatedKeywordsPage(data);
    },
    async fetchKeywordSuggestions(credentials, input) {
      const data = await fetchSource(SUGGESTIONS_URL, credentials, input, {
        keyword: input.seed,
      });
      return dataForSeoKeywordSuggestionsPage(data);
    },
    async fetchKeywordIdeas(credentials, input) {
      const data = await fetchSource(IDEAS_URL, credentials, input, {
        keywords: [input.seed],
      });
      return dataForSeoKeywordIdeasPage(data);
    },
    async fetchKeywordMetrics(credentials, input) {
      if (input.keywords.length > 700) {
        throw new Error("DataForSEO keyword metrics accepts at most 700 keywords per request.");
      }
      const data = await deps.request(METRICS_URL, credentials, {
        ...deps.locationParams(input.location),
        include_clickstream_data: input.includeClickstream,
        keywords: input.keywords,
      });
      return dataForSeoKeywordMetricsPage(data);
    },
  };
}
