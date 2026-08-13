import type { ProviderCredentials, SerpProvider } from "@/lib/providers/types";
import type { SerpRankLocation } from "@/lib/serp/location";
import {
  dataForSeoDomainOverview,
  dataForSeoHistoricalOverview,
  dataForSeoLabsSourceSnapshotAt,
  dataForSeoRelevantPages,
} from "./dataforseo-domain-payload";
import { DataForSeoError } from "./dataforseo-errors";
import type { DataForSeoResponse } from "./dataforseo-payload";

const OVERVIEW_URL =
  "https://api.dataforseo.com/v3/dataforseo_labs/google/domain_rank_overview/live";
const HISTORY_URL =
  "https://api.dataforseo.com/v3/dataforseo_labs/google/historical_rank_overview/live";
const PAGES_URL = "https://api.dataforseo.com/v3/dataforseo_labs/google/relevant_pages/live";

type DomainMethods = Pick<
  Required<SerpProvider>,
  "fetchDomainRankOverview" | "fetchHistoricalRankOverview" | "fetchRelevantPages"
>;

type Dependencies = {
  locationParams: (location: SerpRankLocation) => object;
  request: (
    url: string,
    credentials: ProviderCredentials,
    payload: Record<string, unknown>,
  ) => Promise<DataForSeoResponse>;
  requestStatus: (credentials: ProviderCredentials) => Promise<DataForSeoResponse>;
};

export function createDataForSeoDomainMethods(deps: Dependencies): DomainMethods {
  const commonPayload = (input: {
    includeSubdomains: boolean;
    languageCode?: string;
    location: SerpRankLocation;
    locationCode?: number;
    target: string;
  }) => ({
    target: input.target,
    ...(input.locationCode === undefined
      ? deps.locationParams(input.location)
      : {
          language_code: input.languageCode ?? input.location.hl,
          location_code: input.locationCode,
        }),
    // These Labs endpoints reject include_subdomains; scope is selected by the
    // service layer via the exact target (root vs subdomain), not a payload flag.
  });

  return {
    async fetchDomainRankOverview(credentials, input) {
      const sourceSnapshotAt = dataForSeoLabsSourceSnapshotAt(
        await deps.requestStatus(credentials),
      );
      if (!sourceSnapshotAt) {
        throw new DataForSeoError(
          "DataForSEO Labs Status did not return a valid Google source snapshot date.",
          true,
        );
      }
      const data = await deps.request(OVERVIEW_URL, credentials, commonPayload(input));
      return { ...dataForSeoDomainOverview(data), sourceSnapshotAt };
    },
    async fetchHistoricalRankOverview(credentials, input) {
      const payload: Record<string, unknown> = { ...commonPayload(input) };
      if (input.dateFrom) payload.date_from = input.dateFrom;
      if (input.dateTo) payload.date_to = input.dateTo;
      const data = await deps.request(HISTORY_URL, credentials, payload);
      return dataForSeoHistoricalOverview(data);
    },
    async fetchRelevantPages(credentials, input) {
      const limit = Math.max(1, Math.min(1_000, Math.trunc(input.limit)));
      const offset = Math.max(0, Math.trunc(input.offset));
      const data = await deps.request(PAGES_URL, credentials, {
        ...commonPayload(input),
        limit,
        offset,
        order_by: ["metrics.organic.etv,desc"],
      });
      return dataForSeoRelevantPages(data);
    },
  };
}
