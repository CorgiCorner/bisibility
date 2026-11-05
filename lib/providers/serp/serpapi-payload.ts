import { normalizeDomain } from "@/lib/domains/normalize";
import type { SerpRawPayload } from "@/lib/providers/types";
import { isGoogleRedirectUrl } from "./google-redirect";
import {
  type OrganicResultCandidate,
  type OrganicResultDecision,
  organicResultNormalization,
} from "./organic-result-decision";
import { requireDeterminateOrganicResult } from "./payload-contract-error";
import { UnresolvedRedirectError } from "./unresolved-redirect-error";

export type SerpApiOrganicResult = {
  position?: number;
  link?: string;
  displayed_link?: string;
  source?: string;
  title?: string;
};

export type SerpApiResponse = {
  search_metadata?: { id?: string; status?: string };
  search_parameters?: { start?: number | string };
  error?: string;
  extra_credits?: number;
  organic_results?: unknown[];
  plan_searches_left?: number;
  pagination?: { next?: string };
  serpapi_pagination?: { next?: string; next_link?: string };
  searches_per_month?: number;
  total_searches_left?: number;
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

/** Presentation text such as displayed_link or source must not establish a ranking. */
function destinationDomain(link: unknown) {
  if (typeof link !== "string" || !/^https?:\/\//i.test(link.trim())) return undefined;
  if (isGoogleRedirectUrl(link)) return undefined;
  return normalizeDomain(link) ?? undefined;
}

/**
 * SerpApi normally restarts `position` at 1 on each page, and a page can
 * hold fewer than ten organic results. `precedingOrganicCount` is the number of organic results the
 * earlier pages actually returned, so ranks stay one continuous ordinal instead of skipping the
 * missing slots of a short page. Native absolute positions retain their validated page offset.
 */
export function serpApiOrganicCandidates(
  results: readonly unknown[],
  precedingOrganicCount: number,
  start = 0,
): OrganicResultCandidate[] {
  const absolutePositions =
    start > 0 &&
    results.length > 0 &&
    results.every((value) => {
      const position = record(value)?.position;
      return typeof position === "number" && position > start;
    });
  return results.map((value) => {
    const item = record(value);
    if (!item) return {};
    const position = item.position;
    return {
      domain: destinationDomain(item.link),
      rank:
        typeof position === "number" && Number.isSafeInteger(position) && position > 0
          ? (absolutePositions ? 0 : precedingOrganicCount) + position
          : position,
      title: item.title,
      url: item.link,
    };
  });
}

export function requireSerpApiOrganicDecision(decision: OrganicResultDecision) {
  if (decision.outcome === "indeterminate" && decision.unestablishedDestination) {
    throw new UnresolvedRedirectError(null);
  }
  return requireDeterminateOrganicResult("SerpApi", decision);
}

// biome-ignore format: compact list mirrors the SerpApi response feature names.
function responseFeatures(data: SerpApiResponse) { return ["ai_overview", "answer_box", "knowledge_graph", "local_results", "inline_images", "images_results", "related_questions", "top_stories", "shopping_results", "video_results", "inline_videos", "news_results", "recipes_results", "events_results", "discussions_and_forums", "perspectives", "places_results", "top_ads", "bottom_ads", "ads"].filter((key) => hasFeature((data as Record<string, unknown>)[key])).map(featureLabel); }

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
