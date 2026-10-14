import { normalizeDomain } from "@/lib/domains/normalize";
import type { SerpRankInput } from "@/lib/providers/types";
import { resolveSerpStopOnMatch } from "@/lib/serp/constants";
import type { ProviderRequest } from "@usagekit/providers";
import { dataForSeoGoogleParams } from "./dataforseo-client";

export const DATA_FOR_SEO_SERP_URL =
  "https://api.dataforseo.com/v3/serp/google/organic/live/advanced";
export const STOP_ON_MATCH_TYPE = "with_subdomains";

/** Shared wire task for live transport and credential-free synthetic admission. */
export function dataForSeoRankTask(input: SerpRankInput) {
  const requestParams = dataForSeoGoogleParams({
    depth: input.depth,
    location: input.location,
  });
  const stopTarget = normalizeDomain(input.domain) ?? input.domain;
  return {
    ...requestParams,
    keyword: input.keyword,
    search_param: "&nfpr=1",
    device: input.device,
    ...(input.tag ? { tag: input.tag } : {}),
    ...(resolveSerpStopOnMatch(input.stopOnMatch)
      ? {
          find_targets_in: ["organic"],
          stop_crawl_on_match: [{ match_type: STOP_ON_MATCH_TYPE, match_value: stopTarget }],
        }
      : {}),
  };
}

export function dataForSeoRankRequest(input: SerpRankInput): ProviderRequest & { body: string } {
  return {
    method: "POST",
    url: DATA_FOR_SEO_SERP_URL,
    headers: { "content-type": "application/json" },
    body: JSON.stringify([dataForSeoRankTask(input)]),
  };
}
