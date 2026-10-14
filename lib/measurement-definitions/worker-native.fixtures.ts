import { locationForProvider } from "@/lib/rank-check/fallback-location";
import { serpRankLocation } from "@/lib/serp/location";
import type { ProviderRequest } from "@usagekit/providers";
import { frozenRequest } from "./canonical";
import { definitionBindingFixture, definitionSourceFixture } from "./fixtures";
import type { DefinitionBinding } from "./model";
export function nativeBindingFixture(providerId: "serpapi" | "dataforseo"): DefinitionBinding {
  const source = definitionSourceFixture();
  source.policy.config!.adapters.push({
    providerId,
    capabilityVersion: "web-serp-v1",
    adapterVersion: `${providerId}-observation-v1`,
    nativeFindTargetsIn: providerId === "dataforseo" ? "with_subdomains_on_match" : "none",
  });
  const binding = definitionBindingFixture(source);
  return { ...binding, request: frozenRequest(source, providerId, 20) };
}
export function nativeRequestFixture(binding: DefinitionBinding, start = 0): ProviderRequest {
  const r = binding.request;
  if (r.providerId === "serpapi") {
    const params = new URLSearchParams({
      engine: "google",
      q: r.keyword,
      device: r.device,
      gl: r.location.gl,
      hl: r.location.hl,
      location: r.location.secondaryGeoName,
      nfpr: "1",
    });
    if (start) params.set("start", String(start));
    return { method: "GET", url: `https://serpapi.com/search.json?${params}` };
  }
  const location = locationForProvider(
    "dataforseo",
    serpRankLocation(r.location),
    r.location.kind === "city",
  );
  return {
    method: "POST",
    url: "https://api.dataforseo.com/v3/serp/google/organic/live/advanced",
    body: [
      {
        keyword: r.keyword,
        depth: r.depth,
        device: r.device,
        language_code: location.hl,
        search_param: "&nfpr=1",
        ...(location.primaryGeoCode === null
          ? { location_name: location.primaryGeoName }
          : { location_code: location.primaryGeoCode }),
        ...(r.stopOnMatch
          ? {
              find_targets_in: ["organic"],
              stop_crawl_on_match: [{ match_type: "with_subdomains", match_value: r.domain }],
            }
          : {}),
      },
    ],
  };
}
