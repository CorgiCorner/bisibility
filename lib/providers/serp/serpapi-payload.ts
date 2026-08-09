import type { SerpRawPayload } from "@/lib/providers/types";
import type { OrganicResultCandidate, OrganicResultDecision } from "./organic-result-decision";
import { organicResultNormalization } from "./organic-result-decision";

export type SerpApiOrganicResult = {
  position?: number;
  link?: string;
  displayed_link?: string;
  source?: string;
  title?: string;
};

export type SerpApiResponse = {
  error?: string;
  organic_results?: unknown[];
  total_searches_left?: number;
  plan_searches_left?: number;
};

function featureLabel(value: string) {
  return value.replace(/[_-]+/g, " ");
}

function hasFeature(value: unknown) {
  return Array.isArray(value) ? value.length > 0 : Boolean(value && typeof value === "object");
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function serpApiOrganicCandidates(
  results: readonly unknown[],
  start: number,
): OrganicResultCandidate[] {
  return results.map((value) => {
    const item = record(value);
    if (!item) return {};
    const position = item.position;
    return {
      domain: item.displayed_link ?? item.source,
      rank: typeof position === "number" && Number.isFinite(position) ? start + position : position,
      title: item.title,
      url: item.link,
    };
  });
}

// biome-ignore format: compact list mirrors the SerpApi response feature names.
function responseFeatures(data: SerpApiResponse) { return ["answer_box", "knowledge_graph", "local_results", "inline_images", "images_results", "related_questions", "top_stories", "shopping_results", "video_results", "inline_videos", "news_results", "recipes_results", "events_results", "discussions_and_forums", "perspectives", "places_results", "top_ads", "bottom_ads", "ads"].filter((key) => hasFeature((data as Record<string, unknown>)[key])).map(featureLabel); }

export function rawPayload(
  pages: SerpApiResponse[],
  decision: Exclude<OrganicResultDecision, { outcome: "indeterminate" }>,
): SerpRawPayload {
  const features = [...new Set(pages.flatMap(responseFeatures))];
  return {
    normalization: organicResultNormalization(decision),
    organic_results: decision.organicResults,
    ...(features.length ? { serp_features: features } : {}),
  };
}
