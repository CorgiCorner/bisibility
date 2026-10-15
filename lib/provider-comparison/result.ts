import type { SerpRankResult } from "@/lib/providers/types";
import type { FrozenComparison } from "./model";
import type { ComparisonResult } from "./types";

function safeUrl(value: string | null) {
  if (!value || value.length > 4096) return null;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password
      ? value
      : null;
  } catch {
    return null;
  }
}
export function comparisonResult(
  result: SerpRankResult,
  source: FrozenComparison,
  recordedAt: Date,
): ComparisonResult {
  const observation = result.observation;
  const evidence = observation?.requestPolicy.evidence;
  const position = result.position;
  if (position !== null && (!Number.isSafeInteger(position) || position < 1 || position > 20))
    throw new Error("Invalid comparison position.");
  const completeThrough = evidence?.completeThrough.organic_result ?? null;
  return {
    observedAt: evidence?.observedAt ?? null,
    recordedAt: recordedAt.toISOString(),
    position,
    rankingUrl: safeUrl(result.rankingUrl),
    results: (result.raw?.organic_results ?? [])
      .filter(
        (item) =>
          Number.isSafeInteger(item.rank) && item.rank > 0 && item.rank <= 20 && safeUrl(item.url),
      )
      .slice(0, 20)
      .map((item) => ({
        rank: item.rank,
        url: item.url,
        title: item.title?.slice(0, 2000) ?? null,
        domain: item.domain?.slice(0, 512) ?? null,
      })),
    configuredScope: observation?.configuredScope ?? {
      location: source.locationLabel,
      language: source.location.hl,
      device: source.device,
    },
    effectiveScope: observation?.effectiveScope ?? null,
    completeness: observation?.completeness ?? "unknown",
    normalizationVersion: result.raw?.normalization?.version ?? null,
    evidence:
      position !== null
        ? "positive"
        : completeThrough !== null && completeThrough >= 20
          ? "known_absent"
          : "unknown",
    completeThrough,
  };
}
