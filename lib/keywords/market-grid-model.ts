import type { KeywordRow } from "@/lib/queries/keyword-row-types";

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
  position: number | null;
  rankingUrls: string[];
  sparkline: number[];
  stale: boolean;
  tags: string[];
  volume: number | null;
};

export type MarketGridViewRow = MarketGridTarget & {
  marketGrid?:
    | { aggregate: MarketGridAggregate; expanded: boolean; kind: "parent" }
    | { parentId: string; kind: "child" };
};

export type MarketGridParentMetadata = {
  aggregate: MarketGridAggregate;
  expanded: boolean;
  kind: "parent";
};

export function marketGridParent(row: KeywordRow): MarketGridParentMetadata | undefined {
  const metadata = (row as MarketGridViewRow).marketGrid;
  return metadata?.kind === "parent" ? metadata : undefined;
}

export function marketGridChild(row: KeywordRow) {
  return (row as MarketGridViewRow).marketGrid?.kind === "child";
}

const STALE_AFTER_MS = 48 * 60 * 60 * 1000;

function normalizedKeyword(value: string) {
  return value.trim().toLocaleLowerCase("en-US");
}

function isActive(target: MarketGridTarget) {
  return target.marketStatus !== "paused" && target.marketStatus !== "removed";
}

function pairKey(target: MarketGridTarget) {
  return target.location.canonicalKey;
}

function currentPosition(target: MarketGridTarget) {
  return target.hasRankData ? target.position : null;
}

function best(values: Array<number | null>) {
  const known = values.filter((value): value is number => value !== null);
  return known.length > 0 ? Math.min(...known) : null;
}

function aggregateSparkline(targets: readonly MarketGridTarget[]) {
  const length = Math.max(0, ...targets.map((target) => target.sparkline.length));
  return Array.from({ length }, (_, index) =>
    Math.min(
      ...targets.flatMap((target) => {
        const offset = length - target.sparkline.length;
        const value = target.sparkline[index - offset];
        return value === undefined ? [] : [value];
      }),
    ),
  );
}

function fixedTargetOrder(left: MarketGridTarget, right: MarketGridTarget) {
  return (
    (left.registryOrder ?? Number.MAX_SAFE_INTEGER) -
      (right.registryOrder ?? Number.MAX_SAFE_INTEGER) ||
    left.location.displayName.localeCompare(right.location.displayName) ||
    left.location.hl.localeCompare(right.location.hl) ||
    left.device.localeCompare(right.device) ||
    left.id.localeCompare(right.id)
  );
}

export function aggregateMarketGridRows(
  rows: readonly MarketGridTarget[],
  now = new Date(),
): MarketGridAggregate[] {
  const groups = new Map<string, MarketGridTarget[]>();
  for (const row of rows) {
    const key = normalizedKeyword(row.keyword);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  return [...groups.values()].map((group) => {
    const children = [...group].sort(fixedTargetOrder);
    const active = children.filter(isActive);
    const pairRows = new Map<string, MarketGridTarget>();
    for (const target of active) {
      if (!pairRows.has(pairKey(target))) pairRows.set(pairKey(target), target);
    }
    const pairs = [...pairRows.values()];
    const supportedVolumePairs = pairs.filter((target) => target.volumeKnown !== false);
    const position = best(active.map(currentPosition));
    const priorPosition = best(active.map((target) => target.positionBaseline));
    const difficulty =
      pairs.length === 0
        ? null
        : pairs.length > 1
          ? "mixed"
          : pairs[0]?.difficultyKnown === false
            ? null
            : (pairs[0]?.difficulty ?? null);
    const rankingUrls = [...new Set(active.flatMap((target) => target.rankingUrl ?? []))];
    const stale = active.some((target) => {
      if (!target.lastCheckAt) return false;
      return now.getTime() - new Date(target.lastCheckAt).getTime() > STALE_AFTER_MS;
    });

    return {
      activeTargetCount: active.length,
      change: position === null || priorPosition === null ? null : priorPosition - position,
      children,
      difficulty,
      hasPartiallyUnsupportedVolume:
        supportedVolumePairs.length > 0 && supportedVolumePairs.length < pairs.length,
      keyword: children[0]?.keyword ?? "",
      position,
      rankingUrls,
      sparkline: aggregateSparkline(active),
      stale,
      tags: children[0]?.tags ?? [],
      volume:
        supportedVolumePairs.length === 0
          ? null
          : supportedVolumePairs.reduce((total, target) => total + target.volume, 0),
    };
  });
}

export function marketGridDefaultsToGrouped(rows: readonly MarketGridTarget[]) {
  return new Set(rows.map(pairKey)).size >= 2;
}

function parentId(keyword: string) {
  return `market-group:${encodeURIComponent(normalizedKeyword(keyword))}`;
}

function parentRow(aggregate: MarketGridAggregate, expanded: boolean): MarketGridViewRow {
  const source = aggregate.children[0];
  if (!source) throw new Error("A market grid group requires at least one target.");
  const marketCount = new Set(aggregate.children.filter(isActive).map(pairKey)).size;
  const position = aggregate.position ?? 101;
  return {
    ...source,
    device: `${aggregate.activeTargetCount} targets`,
    difficulty: typeof aggregate.difficulty === "number" ? aggregate.difficulty : 0,
    difficultyKnown: typeof aggregate.difficulty === "number",
    hasRankData: aggregate.position !== null,
    id: parentId(aggregate.keyword),
    location: {
      ...source.location,
      displayName: `${marketCount} ${marketCount === 1 ? "market" : "markets"}`,
    },
    locationName: `${marketCount} ${marketCount === 1 ? "market" : "markets"}`,
    marketGrid: { aggregate, expanded, kind: "parent" },
    position,
    positionBaseline: aggregate.change === null ? null : position + aggregate.change,
    rankingPages: aggregate.rankingUrls.length,
    rankingPath: null,
    rankingUrl: aggregate.rankingUrls.length === 1 ? aggregate.rankingUrls[0] : null,
    sparkline: aggregate.sparkline,
    tags: aggregate.tags,
    volume: aggregate.volume ?? 0,
    volumeKnown: aggregate.volume !== null,
  };
}

export function buildMarketGridViewRows(
  rows: readonly MarketGridTarget[],
  grouped: boolean,
  expandedParentIds: ReadonlySet<string>,
  sort: { field: string; sort: "asc" | "desc" } | null = null,
): MarketGridViewRow[] {
  if (!grouped) return [...rows];
  const aggregates = aggregateMarketGridRows(rows);
  if (sort) {
    const direction = sort.sort === "asc" ? 1 : -1;
    aggregates.sort((left, right) => {
      const leftValue = aggregateSortValue(left, sort.field);
      const rightValue = aggregateSortValue(right, sort.field);
      if (typeof leftValue === "number" && typeof rightValue === "number") {
        return (leftValue - rightValue) * direction || left.keyword.localeCompare(right.keyword);
      }
      return (
        String(leftValue ?? "").localeCompare(String(rightValue ?? "")) * direction ||
        left.keyword.localeCompare(right.keyword)
      );
    });
  }
  return aggregates.flatMap((aggregate) => {
    const id = parentId(aggregate.keyword);
    const expanded = expandedParentIds.has(id);
    const parent = parentRow(aggregate, expanded);
    return expanded
      ? [
          parent,
          ...aggregate.children.map((child) => ({
            ...child,
            marketGrid: { kind: "child" as const, parentId: id },
            tags: [],
          })),
        ]
      : [parent];
  });
}

function aggregateSortValue(aggregate: MarketGridAggregate, field: string) {
  if (field === "position") return aggregate.position ?? Number.MAX_SAFE_INTEGER;
  if (field === "change") return aggregate.change ?? Number.MIN_SAFE_INTEGER;
  if (field === "volume") return aggregate.volume ?? Number.MIN_SAFE_INTEGER;
  if (field === "difficulty")
    return typeof aggregate.difficulty === "number"
      ? aggregate.difficulty
      : Number.MIN_SAFE_INTEGER;
  if (field === "sparkline") return aggregate.sparkline.at(-1) ?? Number.MAX_SAFE_INTEGER;
  return aggregate.keyword;
}

export function selectedMarketTargetIds(
  viewRows: readonly MarketGridViewRow[],
  selectedIds: ReadonlySet<string>,
) {
  const selected = new Set<string>();
  for (const row of viewRows) {
    if (!selectedIds.has(row.id)) continue;
    if (row.marketGrid?.kind === "parent") {
      for (const child of row.marketGrid.aggregate.children) selected.add(child.id);
    } else {
      selected.add(row.id);
    }
  }
  return [...selected];
}
