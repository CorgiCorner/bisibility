import { dataForSeoRankRequest } from "@/lib/providers/serp/dataforseo-rank-request";
import { serpApiRankRequest } from "@/lib/providers/serp/serpapi-request";
import type { SerpRankInput } from "@/lib/providers/types";
import type { ProviderRequest } from "@usagekit/providers";
import { comparisonDepth, comparisonHash, type FrozenComparison } from "./model";
import type { ComparisonProvider } from "./types";
export function comparisonRankInput(snapshot: FrozenComparison, tag?: string): SerpRankInput {
  return {
    keyword: snapshot.text,
    location: snapshot.location,
    device: snapshot.device,
    domain: snapshot.domain,
    depth: comparisonDepth,
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
/** Exact credential-free native variants; only the second allowed SerpApi page may differ. */
export function comparisonRequestKey(
  provider: ComparisonProvider,
  snapshot: FrozenComparison,
  request: ProviderRequest | undefined,
  tag: string,
) {
  if (!request) throw new Error("Comparison native request is unavailable.");
  const input = comparisonRankInput(snapshot, tag);
  const expected =
    provider === "dataforseo" ? dataForSeoRankRequest(input) : serpApiRankRequest(input);
  if (provider === "serpapi") {
    const actual = new URL(request.url),
      start = actual.searchParams.get("start");
    if (start !== null && start !== "10")
      throw new Error("Comparison page is outside the quoted scope.");
    if (start === "10") {
      const url = new URL(expected.url);
      url.searchParams.set("start", "10");
      expected.url = url.href;
    }
  }
  const shape = requestShape(request);
  if (JSON.stringify(shape) !== JSON.stringify(requestShape(expected)))
    throw new Error("Comparison native request changed scope.");
  return comparisonHash(shape);
}
