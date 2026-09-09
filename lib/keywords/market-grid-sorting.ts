import type { KeywordRow } from "@/lib/queries/keyword-row-types";

const MARKET_GRID_LOCALE = "en-US";

export type MarketGridTarget = KeywordRow & {
  marketStatus?: "active" | "paused" | "removed";
  registryOrder?: number;
};

export type MarketGridAggregate = {
  activeTargetCount: number;
  change: number | null;
  children: MarketGridTarget[];
  difficulty: number | "mixed" | null;
  hasPartiallyUnsupportedVolume: boolean;
  keyword: string;
  lastChecked: string | null;
  position: number | null;
  rankingUrls: string[];
  sparkline: number[];
  stale: boolean;
  tags: string[];
  volume: number | null;
};

export function marketGridTerm(value: string) {
  return value.trim().toLocaleLowerCase(MARKET_GRID_LOCALE);
}

export function compareMarketGridText(left: string, right: string) {
  return left.localeCompare(right, MARKET_GRID_LOCALE);
}

export function fixedTargetOrder(left: MarketGridTarget, right: MarketGridTarget) {
  return (
    (left.registryOrder ?? Number.MAX_SAFE_INTEGER) -
      (right.registryOrder ?? Number.MAX_SAFE_INTEGER) ||
    compareMarketGridText(left.location.displayName, right.location.displayName) ||
    compareMarketGridText(left.location.hl, right.location.hl) ||
    compareMarketGridText(left.device, right.device) ||
    compareMarketGridText(left.id, right.id)
  );
}

export function aggregateSortValue(aggregate: MarketGridAggregate, field: string) {
  if (field === "position") return aggregate.position ?? Number.MAX_SAFE_INTEGER;
  if (field === "change") return aggregate.change ?? Number.MIN_SAFE_INTEGER;
  if (field === "volume") return aggregate.volume ?? Number.MIN_SAFE_INTEGER;
  if (field === "difficulty") {
    return typeof aggregate.difficulty === "number" ? aggregate.difficulty : null;
  }
  if (field === "sparkline") return aggregate.position ?? Number.MAX_SAFE_INTEGER;
  if (field === "lastChecked") return aggregate.lastChecked;
  const source = aggregate.children[0];
  if (!source) return "";
  if (field === "frequency") return source.schedule.frequency;
  if (field === "location") return source.location.displayName;
  if (field === "targetRanking") {
    return [source.targetUrl, source.rankingUrl].filter(Boolean).join(" ");
  }
  if (field === "tags") return aggregate.tags.join(" ");
  if (field === "topic") return source.topic ?? "";
  if (field === "intent") return source.intent ?? "";
  if (field === "device") return source.device;
  if (field === "clicks") return source.clicks;
  if (field === "impressions") return source.impressions;
  if (field === "ctr") return source.ctr;
  return aggregate.keyword;
}

export function compareMarketGridAggregates(
  left: MarketGridAggregate,
  right: MarketGridAggregate,
  sort: { direction: "asc" | "desc"; field: string },
) {
  const leftValue = aggregateSortValue(left, sort.field);
  const rightValue = aggregateSortValue(right, sort.field);
  if (sort.field === "difficulty" && (leftValue === null || rightValue === null)) {
    if (leftValue === rightValue) return compareMarketGridText(left.keyword, right.keyword);
    return leftValue === null ? 1 : -1;
  }
  if (leftValue == null || rightValue == null) {
    if (leftValue === rightValue) return compareMarketGridText(left.keyword, right.keyword);
    return leftValue == null
      ? sort.direction === "asc"
        ? -1
        : 1
      : sort.direction === "asc"
        ? 1
        : -1;
  }
  const direction = sort.direction === "asc" ? 1 : -1;
  if (typeof leftValue === "number" && typeof rightValue === "number") {
    return (
      (leftValue - rightValue) * direction ||
      compareMarketGridText(left.keyword, right.keyword) ||
      compareMarketGridText(marketGridTerm(left.keyword), marketGridTerm(right.keyword))
    );
  }
  return (
    compareMarketGridText(String(leftValue), String(rightValue)) * direction ||
    compareMarketGridText(left.keyword, right.keyword) ||
    compareMarketGridText(marketGridTerm(left.keyword), marketGridTerm(right.keyword))
  );
}
