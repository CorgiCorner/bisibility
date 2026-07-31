import type {
  KeywordMetrics,
  RankedKeywordsPage,
  ResearchPage,
  SerpRawPayload,
} from "@/lib/providers/types";
import type { SerpDepth } from "@/lib/serp/markets";
import {
  decideOrganicResult,
  type OrganicResultDecision,
  organicResultNormalization,
} from "./organic-result-decision";

export type DataForSeoItem = {
  domain?: string;
  rank_absolute?: number;
  rank_group?: number;
  title?: string;
  type?: string;
  url?: string;
};

export type DataForSeoResponse = {
  cost?: number;
  status_code?: number;
  status_message?: string;
  tasks?: Array<{
    cost?: number;
    result?: Array<{
      items?: unknown[];
      total_count?: number;
    }>;
    status_code?: number;
    status_message?: string;
  }>;
};

type RankedKeywordItem = {
  keyword_data?: {
    keyword?: string;
    keyword_info?: { search_volume?: number | null };
  };
  ranked_serp_element?: {
    serp_item?: { etv?: number | null; rank_absolute?: number | null };
  };
};

type KeywordInfo = {
  competition?: number | null;
  cpc?: number | null;
  monthly_searches?: Array<{ month?: number; search_volume?: number | null; year?: number }>;
  search_volume?: number | null;
};

type ResearchItem = {
  keyword?: string;
  keyword_data?: ResearchItem;
  keyword_info?: KeywordInfo | null;
  keyword_info_normalized_with_clickstream?: KeywordInfo | null;
  keyword_properties?: { keyword_difficulty?: number | null } | null;
  search_intent_info?: { main_intent?: string | null } | null;
};

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function intent(value: unknown): KeywordMetrics["intent"] {
  if (value == null) return null;
  if (
    value === "informational" ||
    value === "commercial" ||
    value === "transactional" ||
    value === "navigational"
  )
    return value;
  return "unknown";
}

function metrics(item: ResearchItem): KeywordMetrics {
  const baseInfo = item.keyword_info ?? {};
  const volumeInfo = item.keyword_info_normalized_with_clickstream ?? baseInfo;
  const cpc = finiteNumber(baseInfo.cpc);
  return {
    competition: finiteNumber(baseInfo.competition),
    cpcCents: cpc === null ? null : Math.round(cpc * 100),
    difficulty: finiteNumber(item.keyword_properties?.keyword_difficulty),
    intent: intent(item.search_intent_info?.main_intent),
    monthlyTrend: (volumeInfo.monthly_searches ?? []).slice(0, 12).flatMap((row) => {
      const month = finiteNumber(row.month);
      const year = finiteNumber(row.year);
      if (month === null || year === null) return [];
      return [{ month, searchVolume: finiteNumber(row.search_volume), year }];
    }),
    searchVolume: finiteNumber(volumeInfo.search_volume),
  };
}

function researchPage(data: DataForSeoResponse, nested: boolean): ResearchPage {
  const result = data.tasks?.[0]?.result?.[0] as { items?: ResearchItem[] } | undefined;
  const rows = (result?.items ?? []).flatMap((raw) => {
    const item = nested ? raw.keyword_data : raw;
    const keyword = item?.keyword?.trim();
    return keyword && item ? [{ keyword, ...metrics(item) }] : [];
  });
  return { costCents: dataForSeoResponseCostCents(data), rows };
}

export function dataForSeoRelatedKeywordsPage(data: DataForSeoResponse) {
  return researchPage(data, true);
}

export function dataForSeoKeywordSuggestionsPage(data: DataForSeoResponse) {
  return researchPage(data, false);
}

export function dataForSeoKeywordIdeasPage(data: DataForSeoResponse) {
  return researchPage(data, false);
}

export function dataForSeoKeywordMetricsPage(data: DataForSeoResponse) {
  return researchPage(data, false);
}

export function dataForSeoRankedKeywordsPage(data: DataForSeoResponse): RankedKeywordsPage {
  const result = data.tasks?.[0]?.result?.[0] as
    | { items?: RankedKeywordItem[]; total_count?: number }
    | undefined;
  const rows = (result?.items ?? []).flatMap((item) => {
    const keyword = item.keyword_data?.keyword?.trim();
    if (!keyword) return [];
    return [
      {
        estimatedTraffic: finiteNumber(item.ranked_serp_element?.serp_item?.etv),
        keyword,
        position: finiteNumber(item.ranked_serp_element?.serp_item?.rank_absolute),
        searchVolume: finiteNumber(item.keyword_data?.keyword_info?.search_volume),
      },
    ];
  });
  return {
    costCents: dataForSeoResponseCostCents(data),
    rows,
    totalCount: finiteNumber(result?.total_count),
  };
}

function featureLabel(value: string) {
  return value.trim().replace(/[_-]+/g, " ");
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function organicCandidate(value: unknown) {
  const item = record(value);
  if (!item || typeof item.type !== "string") return {};
  if (item.type !== "organic") return null;
  return {
    domain: item.domain,
    rank: item.rank_group,
    title: item.title,
    url: item.url,
  };
}

export function dataForSeoOrganicDecision(
  items: readonly unknown[] | undefined,
  domain: string,
  depth: SerpDepth,
) {
  return decideOrganicResult({
    candidates: (items ?? []).flatMap((item) => {
      const candidate = organicCandidate(item);
      return candidate === null ? [] : [candidate];
    }),
    depth,
    domain,
  });
}

export function dataForSeoRawPayload(
  items: readonly unknown[] = [],
  decision: Exclude<OrganicResultDecision, { outcome: "indeterminate" }>,
): SerpRawPayload {
  const features = new Set<string>();
  for (const value of items) {
    const item = record(value);
    if (typeof item?.type === "string" && item.type !== "organic") {
      features.add(featureLabel(item.type));
    }
  }
  return {
    normalization: organicResultNormalization(decision),
    organic_results: decision.organicResults,
    ...(features.size ? { serp_features: [...features] } : {}),
  };
}

export function dataForSeoResponseCostCents(data: DataForSeoResponse) {
  const taskCost = data.tasks?.reduce((sum, task) => sum + (task.cost ?? 0), 0) ?? 0;
  return Number(((data.cost ?? taskCost) * 100).toFixed(4));
}
