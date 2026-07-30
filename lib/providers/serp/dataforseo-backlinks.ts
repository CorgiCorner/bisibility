import type { ProviderCredentials, SerpProvider } from "@/lib/providers/types";
import {
  dataForSeoBacklinksHistory,
  dataForSeoBacklinksRows,
  dataForSeoBacklinksSummary,
} from "./dataforseo-backlinks-payload";
import type { DataForSeoResponse } from "./dataforseo-payload";

const SUMMARY_URL = "https://api.dataforseo.com/v3/backlinks/summary/live";
const HISTORY_URL = "https://api.dataforseo.com/v3/backlinks/history/live";
const BACKLINKS_URL = "https://api.dataforseo.com/v3/backlinks/backlinks/live";

type BacklinksMethods = Pick<
  Required<SerpProvider>,
  "fetchBacklinksHistory" | "fetchBacklinksRows" | "fetchBacklinksSummary"
>;

type Dependencies = {
  now?: () => Date;
  request: (
    url: string,
    credentials: ProviderCredentials,
    payload: Record<string, unknown>,
  ) => Promise<DataForSeoResponse>;
};

function commonPayload(input: Parameters<BacklinksMethods["fetchBacklinksSummary"]>[1]) {
  return {
    backlinks_status_type: "all",
    exclude_internal_backlinks: true,
    include_indirect_links: false,
    include_subdomains: input.includeSubdomains,
    rank_scale: "one_hundred",
    target: input.target,
  };
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function lastTwelveFullMonths(now: Date) {
  const dateFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 12, 1));
  const dateTo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
  return { date_from: isoDate(dateFrom), date_to: isoDate(dateTo) };
}

export function createDataForSeoBacklinksMethods(deps: Dependencies): BacklinksMethods {
  return {
    async fetchBacklinksSummary(credentials, input) {
      const data = await deps.request(SUMMARY_URL, credentials, commonPayload(input));
      return dataForSeoBacklinksSummary(data);
    },
    async fetchBacklinksHistory(credentials, input) {
      if (input.targetScope !== "site") return { costCents: 0, rows: [] };
      const data = await deps.request(HISTORY_URL, credentials, {
        ...commonPayload(input),
        ...lastTwelveFullMonths((deps.now ?? (() => new Date()))()),
      });
      return dataForSeoBacklinksHistory(data);
    },
    async fetchBacklinksRows(credentials, input) {
      const limit = Math.max(1, Math.min(1_000, Math.trunc(input.limit)));
      const offset = Math.max(0, Math.min(Math.trunc(input.offset), limit * 10));
      const data = await deps.request(BACKLINKS_URL, credentials, {
        ...commonPayload(input),
        limit,
        mode: input.mode,
        offset,
      });
      return dataForSeoBacklinksRows(data);
    },
  };
}
