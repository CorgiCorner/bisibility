import { domainMatches, normalizeDomain } from "@/lib/domains/normalize";
import type { SerpRawPayload } from "@/lib/providers/types";

export type SerpApiOrganicResult = {
  position?: number;
  link?: string;
  displayed_link?: string;
  source?: string;
  title?: string;
};

export type SerpApiResponse = {
  error?: string;
  organic_results?: SerpApiOrganicResult[];
  total_searches_left?: number;
  plan_searches_left?: number;
};

export type SerpApiRankedOrganicResult = SerpApiOrganicResult & {
  rank: number;
};

export function findRankingItem(results: SerpApiRankedOrganicResult[], domain: string) {
  return results.find((item) => domainMatches(item.link ?? item.displayed_link, domain));
}

function featureLabel(value: string) {
  return value.replace(/[_-]+/g, " ");
}

function hasFeature(value: unknown) {
  return Array.isArray(value) ? value.length > 0 : Boolean(value && typeof value === "object");
}

// biome-ignore format: compact list mirrors the SerpAPI response feature names.
function responseFeatures(data: SerpApiResponse) { return ["answer_box", "knowledge_graph", "local_results", "inline_images", "images_results", "related_questions", "top_stories", "shopping_results", "video_results", "inline_videos", "news_results", "recipes_results", "events_results", "discussions_and_forums", "perspectives", "places_results", "top_ads", "bottom_ads", "ads"].filter((key) => hasFeature((data as Record<string, unknown>)[key])).map(featureLabel); }

function rawOrganicResult(item: SerpApiRankedOrganicResult) {
  if (!item.link) {
    return null;
  }
  const domain = normalizeDomain(item.link);
  if (!domain) return null;

  return {
    domain,
    rank: item.rank,
    title: typeof item.title === "string" ? item.title : null,
    url: item.link,
  };
}

export function rawPayload(
  pages: SerpApiResponse[],
  results: SerpApiRankedOrganicResult[],
): SerpRawPayload {
  const organic = results.map(rawOrganicResult).filter((item) => item !== null);
  const features = [...new Set(pages.flatMap(responseFeatures))];
  return {
    organic_results: organic,
    ...(features.length ? { serp_features: features } : {}),
  };
}
