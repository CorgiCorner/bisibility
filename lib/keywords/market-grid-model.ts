import type { KeywordRow } from "@/lib/queries/keyword-row-types";
import type { LensLocationOption } from "./lens-model";
import type { MarketGridAggregate, MarketGridTarget } from "./market-grid-sorting";
import { compareMarketGridText, fixedTargetOrder, marketGridTerm } from "./market-grid-sorting";

export type MarketGridViewRow = MarketGridTarget & {
  kind?: "group";
  marketGrid?:
    | { aggregate: MarketGridAggregate; kind: "parent" }
    | { parentId: string; kind: "child" };
  subRows?: MarketGridViewRow[];
};

export type MarketGridGroupRow = MarketGridViewRow & {
  kind: "group";
  subRows: MarketGridViewRow[];
};

export type MarketGridParentMetadata = {
  aggregate: MarketGridAggregate;
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
  let length = 0;
  for (const target of targets) length = Math.max(length, target.sparkline.length);
  const result: number[] = [];
  for (let index = 0; index < length; index += 1) {
    let point: number | undefined;
    for (const target of targets) {
      const value = target.sparkline[index - (length - target.sparkline.length)];
      if (value !== undefined) point = point === undefined ? value : Math.min(point, value);
    }
    if (point !== undefined) result.push(point);
  }
  return result;
}

export function aggregateMarketGridRows(
  rows: readonly MarketGridTarget[],
  now = new Date(),
): MarketGridAggregate[] {
  const groups = new Map<string, MarketGridTarget[]>();
  for (const row of rows) {
    const key = marketGridTerm(row.keyword);
    const group = groups.get(key);
    if (group) {
      group.push(row);
      continue;
    }
    groups.set(key, [row]);
  }

  return [...groups.values()].map((group) => {
    const children = [...group].sort(fixedTargetOrder);
    const active = children.filter(isActive);
    const pairRows = new Map<string, MarketGridTarget>();
    for (const target of active) {
      if (!pairRows.has(pairKey(target))) pairRows.set(pairKey(target), target);
    }
    const pairs = [...pairRows.values()];
    const supportedVolumePairs = new Map<string, MarketGridTarget>();
    for (const target of active) {
      if (target.volumeKnown !== false && !supportedVolumePairs.has(pairKey(target))) {
        supportedVolumePairs.set(pairKey(target), target);
      }
    }
    const knownVolumePairs = [...supportedVolumePairs.values()];
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
    const lastChecked = active.reduce<string | null>((latest, target) => {
      if (!target.lastCheckAt || (latest !== null && target.lastCheckAt <= latest)) return latest;
      return target.lastCheckAt;
    }, null);

    return {
      activeTargetCount: active.length,
      change: position === null || priorPosition === null ? null : priorPosition - position,
      children,
      difficulty,
      hasPartiallyUnsupportedVolume:
        knownVolumePairs.length > 0 && knownVolumePairs.length < pairs.length,
      keyword: children.reduce(
        (lowest, child) =>
          compareMarketGridText(child.keyword, lowest) < 0 ? child.keyword : lowest,
        children[0]?.keyword ?? "",
      ),
      lastChecked,
      position,
      rankingUrls,
      sparkline: aggregateSparkline(active),
      stale,
      tags: children[0]?.tags ?? [],
      volume:
        knownVolumePairs.length === 0
          ? null
          : knownVolumePairs.reduce((total, target) => total + target.volume, 0),
    };
  });
}

export function marketGridDefaultsToGrouped(
  rows: readonly (MarketGridTarget | LensLocationOption)[],
) {
  const canonicalKeys = new Set<string>();
  for (const row of rows) {
    canonicalKeys.add("location" in row ? row.location.canonicalKey : row.id);
  }
  return canonicalKeys.size >= 2;
}

function parentId(keyword: string) {
  return `market-group:${encodeURIComponent(marketGridTerm(keyword))}`;
}

export function groupRow(
  aggregate: MarketGridAggregate,
  children: readonly MarketGridTarget[],
): MarketGridGroupRow {
  const source = children[0];
  if (!source) throw new Error("A market grid group requires at least one target.");
  const id = parentId(aggregate.keyword);
  const marketCount = new Set(children.filter(isActive).map(pairKey)).size;
  const position = aggregate.position ?? 101;
  return {
    ...source,
    device: `${aggregate.activeTargetCount} targets`,
    difficulty: typeof aggregate.difficulty === "number" ? aggregate.difficulty : 0,
    difficultyKnown: typeof aggregate.difficulty === "number",
    hasRankData: aggregate.position !== null,
    id,
    kind: "group",
    keyword: aggregate.keyword,
    lastCheckAt: aggregate.lastChecked,
    location: {
      ...source.location,
      displayName: `${marketCount} ${marketCount === 1 ? "market" : "markets"}`,
    },
    locationName: `${marketCount} ${marketCount === 1 ? "market" : "markets"}`,
    marketGrid: { aggregate, kind: "parent" },
    position,
    positionBaseline: aggregate.change === null ? null : position + aggregate.change,
    rankingPages: aggregate.rankingUrls.length,
    rankingPath: null,
    rankingUrl: aggregate.rankingUrls.length === 1 ? aggregate.rankingUrls[0] : null,
    sparkline: aggregate.sparkline,
    tags: aggregate.tags,
    subRows: children.map((child) => ({
      ...child,
      marketGrid: { kind: "child" as const, parentId: id },
      tags: [],
    })),
    volume: aggregate.volume ?? 0,
    volumeKnown: aggregate.volume !== null,
  } as MarketGridGroupRow;
}

export type { MarketGridAggregate, MarketGridTarget } from "./market-grid-sorting";
export {
  aggregateSortValue,
  compareMarketGridAggregates,
  marketGridTerm,
} from "./market-grid-sorting";
