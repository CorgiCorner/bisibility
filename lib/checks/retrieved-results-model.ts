import type { RetrievedResults, RetrievedRow } from "@/lib/checks/contract";

export type KnownFeature =
  | "ads"
  | "aiOverview"
  | "discussions"
  | "events"
  | "featuredSnippet"
  | "images"
  | "knowledgePanel"
  | "localPack"
  | "news"
  | "peopleAlsoAsk"
  | "recipes"
  | "relatedSearches"
  | "shopping"
  | "sitelinks"
  | "topStories"
  | "video";

export type FeatureChip = { known: KnownFeature | null; raw: string };

const FEATURE_MAP: Record<string, KnownFeature> = {
  "ai overview": "aiOverview",
  "answer box": "featuredSnippet",
  "featured snippet": "featuredSnippet",
  "people also ask": "peopleAlsoAsk",
  "related questions": "peopleAlsoAsk",
  "knowledge graph": "knowledgePanel",
  "local pack": "localPack",
  "local results": "localPack",
  "places results": "localPack",
  "inline images": "images",
  "images results": "images",
  images: "images",
  "video results": "video",
  "inline videos": "video",
  video: "video",
  sitelinks: "sitelinks",
  "top stories": "topStories",
  "news results": "news",
  shopping: "shopping",
  "shopping results": "shopping",
  "discussions and forums": "discussions",
  perspectives: "discussions",
  recipes: "recipes",
  "recipes results": "recipes",
  "events results": "events",
  events: "events",
  "related searches": "relatedSearches",
  "top ads": "ads",
  "bottom ads": "ads",
  ads: "ads",
  paid: "ads",
};

const FEATURE_ORDER: KnownFeature[] = [
  "aiOverview",
  "featuredSnippet",
  "peopleAlsoAsk",
  "knowledgePanel",
  "localPack",
  "images",
  "sitelinks",
  "video",
  "topStories",
  "news",
  "shopping",
  "discussions",
  "recipes",
  "events",
  "relatedSearches",
  "ads",
];

export function featureChips(features: readonly string[]): FeatureChip[] {
  const seen = new Map<KnownFeature, string>();
  const unknown: FeatureChip[] = [];
  for (const raw of features) {
    const known = FEATURE_MAP[raw.toLowerCase()];
    if (known) seen.set(known, raw);
    else unknown.push({ known: null, raw });
  }
  const ordered: FeatureChip[] = [];
  for (const known of FEATURE_ORDER) {
    const raw = seen.get(known);
    if (raw) {
      ordered.push({ known, raw });
      seen.delete(known);
    }
  }
  return [...ordered, ...unknown];
}

export const AI_OVERVIEW_REPORTING_PROVIDERS: readonly string[] = ["dataforseo"];

export function aiOverviewState(provider: string, features: readonly string[]): boolean | null {
  if (!AI_OVERVIEW_REPORTING_PROVIDERS.includes(provider)) return null;
  return features.some((f) => f.toLowerCase() === "ai overview");
}

export function retrievedPositionsOf(rows: readonly RetrievedRow[]): number {
  let max = 0;
  for (const r of rows) {
    if (r.position > max) max = r.position;
  }
  return max;
}

export function gapBlock(input: {
  requestedDepth: number | null;
  retrievedPositions: number;
  stoppedAtResult: boolean;
}): { count: number; end: number; kind: "stopped" | "unknown"; start: number } | null {
  const { requestedDepth: depth, retrievedPositions: got, stoppedAtResult } = input;
  if (depth === null || got >= depth) return null;
  return {
    count: depth - got,
    end: depth,
    kind: stoppedAtResult ? "stopped" : "unknown",
    start: got + 1,
  };
}

export function retentionFooter(input: {
  fullDetailUntil: string | null;
  formatDate: (iso: string) => string;
  retentionDays: number | null;
}): string {
  const { fullDetailUntil, formatDate, retentionDays } = input;
  if (fullDetailUntil === null) {
    return "Full detail for this check is kept for as long as you keep the database.";
  }
  return `Full detail for this check is kept until ${formatDate(fullDetailUntil)}, ${retentionDays} days after it ran. After that one row per domain with its best position survives; titles, URLs, page features and unretrieved positions are dropped.`;
}

export type CompareState = "entered" | "up" | "down" | "unchanged" | "dropped_out";

export type CompareRow = {
  domain: string;
  state: CompareState;
  delta: number;
  from: number | null;
  to: number | null;
};

export type ComparisonBound = {
  kind: "retrieved" | "stopped";
  overlap: number;
  relation: "earlier" | "later";
};

export type CompareResult =
  | {
      kind: "list";
      overlap: number;
      rows: CompareRow[];
      stats: Record<CompareState, number>;
      bound: ComparisonBound;
    }
  | { from: number; kind: "degenerate"; reason: "moved_up_limited"; to: number }
  | { kind: "degenerate"; reason: "insufficient_overlap" }
  | {
      checkedAt: string;
      kind: "refused";
      kept: number;
      relation: "earlier" | "later";
      tier: "compact" | "none";
    };

/** A site can hold two organic results; the domain-keyed view uses its best, as the compact tier does. */
function keepBest(map: Map<string, number>, row: RetrievedRow) {
  const current = map.get(row.domain);
  if (current === undefined || row.position < current) map.set(row.domain, row.position);
}

export function compareChecks(
  from: RetrievedResults,
  to: RetrievedResults,
  _options: { formatDate?: (iso: string) => string; fullCheckDates: readonly string[] },
): CompareResult {
  if (from.tier !== "full" || to.tier !== "full") {
    const offender = from.tier !== "full" ? from : to;
    const earlier = from.checkedAt <= to.checkedAt ? from : to;
    const relation = offender === earlier ? "earlier" : "later";
    const kept =
      offender.tier === "compact"
        ? Math.max(0, ...offender.domains.map((entry) => entry.bestPosition))
        : 0;
    return {
      checkedAt: offender.checkedAt,
      kept,
      kind: "refused",
      relation,
      tier: offender.tier === "compact" ? "compact" : "none",
    };
  }

  const overlap = Math.min(from.retrievedPositions, to.retrievedPositions);

  if (overlap < 3) {
    const fp = from.trackedPosition;
    const tp = to.trackedPosition;
    if (fp !== null && tp !== null && tp < fp) {
      return {
        from: fp,
        kind: "degenerate",
        reason: "moved_up_limited",
        to: tp,
      };
    }
    return {
      kind: "degenerate",
      reason: "insufficient_overlap",
    };
  }

  const fromMap = new Map<string, number>();
  for (const row of from.rows) if (row.position <= overlap) keepBest(fromMap, row);
  const toMap = new Map<string, number>();
  for (const row of to.rows) if (row.position <= overlap) keepBest(toMap, row);
  const rows: CompareRow[] = [];
  const stats: Record<CompareState, number> = {
    entered: 0,
    up: 0,
    down: 0,
    unchanged: 0,
    dropped_out: 0,
  };

  // Only the shallower check bounds the comparison, so only it can be blamed for the tail.
  // Saying "the later check stopped at your result" when the earlier one was shallower, or
  // when neither stopped, is a causal claim the data does not support.
  const bounding = to.retrievedPositions <= from.retrievedPositions ? to : from;
  const bound: ComparisonBound = {
    kind: bounding.stoppedAtResult ? "stopped" : "retrieved",
    overlap,
    relation: bounding === to ? "later" : "earlier",
  };

  for (const [domain, toPos] of toMap) {
    const fromPos = fromMap.get(domain);
    if (fromPos === undefined) {
      rows.push({
        domain,
        state: "entered",
        delta: 0,
        from: null,
        to: toPos,
      });
      stats.entered++;
    } else if (toPos < fromPos) {
      const delta = fromPos - toPos;
      rows.push({
        domain,
        state: "up",
        delta,
        from: fromPos,
        to: toPos,
      });
      stats.up++;
    } else if (toPos > fromPos) {
      const delta = toPos - fromPos;
      rows.push({
        domain,
        state: "down",
        delta,
        from: fromPos,
        to: toPos,
      });
      stats.down++;
    } else {
      rows.push({
        domain,
        state: "unchanged",
        delta: 0,
        from: fromPos,
        to: toPos,
      });
      stats.unchanged++;
    }
  }

  for (const [domain, fromPos] of fromMap) {
    if (!toMap.has(domain)) {
      rows.push({
        domain,
        state: "dropped_out",
        delta: 0,
        from: fromPos,
        to: null,
      });
      stats.dropped_out++;
    }
  }

  rows.sort((a, b) => {
    if (a.state === "dropped_out" && b.state !== "dropped_out") return 1;
    if (a.state !== "dropped_out" && b.state === "dropped_out") return -1;
    const aKey = a.to ?? Infinity;
    const bKey = b.to ?? Infinity;
    if (aKey !== bKey) return aKey - bKey;
    return (a.from ?? Infinity) - (b.from ?? Infinity);
  });

  return {
    kind: "list",
    overlap,
    rows,
    stats,
    bound,
  };
}
