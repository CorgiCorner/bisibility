import { dataForSeoRankRequest } from "@/lib/providers/serp/dataforseo-rank-request";
import { serpApiOverviewRequest, serpApiRankRequest } from "@/lib/providers/serp/serpapi-request";
import type { SerpRankInput } from "@/lib/providers/types";
import type { ProviderRequest } from "@usagekit/providers";
import { comparisonDepth, comparisonHash, type FrozenComparison } from "./model";
import type { ComparisonProvider } from "./types";
export function comparisonRankInput(snapshot: FrozenComparison, tag?: string): SerpRankInput {
  return {
    ...(snapshot.aiOverview ? { fetchAiOverview: true } : {}),
    keyword: snapshot.text,
    location: snapshot.location,
    device: snapshot.device,
    domain: snapshot.domain,
    depth: snapshot.depth ?? comparisonDepth,
    stopOnMatch: false,
    ...(tag ? { tag } : {}),
  };
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  return value && typeof value === "object"
    ? Object.fromEntries(
        Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, item]) => [key, canonical(item)]),
      )
    : value;
}
function requestShape(request: ProviderRequest) {
  const url = new URL(request.url);
  url.searchParams.delete("api_key");
  url.searchParams.sort();
  return {
    method: request.method,
    url: url.href,
    body:
      request.body === undefined
        ? null
        : canonical(typeof request.body === "string" ? JSON.parse(request.body) : request.body),
  };
}
/** Native variants are bounded by the frozen search and optional overview consent. */
export function comparisonRequestKey(
  provider: ComparisonProvider,
  snapshot: FrozenComparison,
  request: ProviderRequest | undefined,
  tag: string,
) {
  if (!request) throw new Error("Comparison native request is unavailable.");
  const actual = new URL(request.url);
  if (provider === "serpapi" && actual.searchParams.get("engine") === "google_ai_overview") {
    if (!snapshot.aiOverview) throw new Error("Overview request was not quoted.");
    const expected = serpApiOverviewRequest(actual.searchParams.get("page_token") ?? "");
    if (JSON.stringify(requestShape(request)) !== JSON.stringify(requestShape(expected)))
      throw new Error("Overview native request changed scope.");
    // One follow-up per frozen consent, regardless of the ephemeral provider token.
    return comparisonHash({ overview: true, scope: snapshot });
  }
  const input = comparisonRankInput(snapshot, tag);
  const expected =
    provider === "dataforseo" ? dataForSeoRankRequest(input) : serpApiRankRequest(input);
  if (provider === "serpapi") {
    const actual = new URL(request.url),
      start = actual.searchParams.get("start");
    if (
      start !== null &&
      (!/^\d+$/.test(start) ||
        Number(start) % 10 !== 0 ||
        Number(start) < 10 ||
        Number(start) >= (snapshot.depth ?? comparisonDepth))
    )
      throw new Error("Comparison page is outside the quoted scope.");
    if (start !== null) {
      const url = new URL(expected.url);
      url.searchParams.set("start", start);
      expected.url = url.href;
    }
  }
  const shape = requestShape(request);
  if (JSON.stringify(shape) !== JSON.stringify(requestShape(expected)))
    throw new Error("Comparison native request changed scope.");
  return comparisonHash(shape);
}
