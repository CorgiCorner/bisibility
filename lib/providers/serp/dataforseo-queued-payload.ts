import { normalizeDomain } from "@/lib/domains/normalize";
import type { DataForSeoQueuePriority } from "@/lib/rank-check/queued-config";
import { resolveSerpDepth, resolveSerpStopOnMatch } from "@/lib/serp/constants";
import type { DataForSeoQueuedTaskInput } from "./dataforseo-queued";

export function queuedRankTaskPayload(
  input: DataForSeoQueuedTaskInput,
  priority: DataForSeoQueuePriority,
) {
  const target = normalizeDomain(input.domain) ?? input.domain;
  return {
    depth: resolveSerpDepth(input.depth),
    device: input.device,
    keyword: input.keyword,
    search_param: "&nfpr=1",
    language_code: input.location.hl,
    ...(input.location.primaryGeoCode === null
      ? { location_name: input.location.primaryGeoName }
      : { location_code: input.location.primaryGeoCode }),
    priority: priority === "high" ? 2 : 1,
    tag: input.attribution.tag,
    ...(resolveSerpStopOnMatch(input.stopOnMatch)
      ? {
          find_targets_in: ["organic"],
          stop_crawl_on_match: [{ match_type: "with_subdomains", match_value: target }],
        }
      : {}),
  };
}
