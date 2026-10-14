import type { FrozenWebRequest } from "@/lib/measurement-definitions/model";
import { dataForSeoObservationRun } from "@/lib/providers/serp/observation-extract-dataforseo";
import { dataForSeoSentScope } from "@/lib/providers/serp/web-local-proof";
import { objectValue } from "@/lib/rank-measurements/recorded-check";

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

/** Task echoes describe the original request. Never substitute today's Keyword geo/device. */
export function queuedDataForSeoObservation(
  task: unknown,
  items: readonly unknown[],
  depth: number,
  executedAt: Date,
  matched = false,
  original?: FrozenWebRequest,
) {
  const row = objectValue(task);
  const data = objectValue(row?.data);
  const results = Array.isArray(row?.result) ? row.result : [];
  const first = objectValue(results[0]);
  const location =
    text(data?.location_name) ||
    text(first?.location_name) ||
    (typeof data?.location_code === "number" ? `code:${data.location_code}` : "");
  const language = text(data?.language_code) || text(first?.language_code);
  const device = text(data?.device) || text(first?.device);
  const stopPolicyKnown = data !== null && Object.hasOwn(data, "stop_crawl_on_match");
  const stopOnMatch =
    stopPolicyKnown &&
    Array.isArray(data?.stop_crawl_on_match) &&
    data.stop_crawl_on_match.length > 0;
  const sentScope = dataForSeoSentScope(data, original?.location);
  return dataForSeoObservationRun({
    sentScope,
    providerResults: results,
    items,
    executedAt,
    configuredScope: original
      ? {
          location: original.location.primaryGeoName,
          language: original.location.hl,
          device: original.device,
        }
      : { location, language, device },
    completeness:
      stopOnMatch && matched
        ? "truncated_by_stop_on_match"
        : stopPolicyKnown && !stopOnMatch
          ? "complete"
          : "unknown",
    requestPolicy: {
      depth,
      forcedAiOverview: false,
      stopOnMatch: original?.stopOnMatch ?? stopOnMatch,
      findTargetsIn: original?.findTargetsIn ?? (stopOnMatch ? "with_subdomains" : null),
    },
  });
}
