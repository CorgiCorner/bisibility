import type { RetrievedResults, RetrievedRow } from "@/lib/checks/contract";

export type FeatureChip = { label: string; description: string };

const FEATURE_MAP: Record<string, string> = {
  "ai overview": "AI overview",
  "answer box": "Featured snippet",
  "featured snippet": "Featured snippet",
  "people also ask": "People also ask",
  "related questions": "People also ask",
  "knowledge graph": "Knowledge panel",
  "local pack": "Local pack",
  "local results": "Local pack",
  "places results": "Local pack",
  "inline images": "Images",
  "images results": "Images",
  images: "Images",
  "video results": "Video",
  "inline videos": "Video",
  video: "Video",
  "top stories": "Top stories",
  "news results": "News",
  shopping: "Shopping",
  "shopping results": "Shopping",
  "discussions and forums": "Discussions",
  perspectives: "Discussions",
  recipes: "Recipes",
  "recipes results": "Recipes",
  "events results": "Events",
  events: "Events",
  "related searches": "Related searches",
  "top ads": "Ads",
  "bottom ads": "Ads",
  ads: "Ads",
  paid: "Ads",
};

const FEATURE_CATALOG: Array<[string, string]> = [
  ["AI overview", "An AI-generated summary shown above organic results."],
  ["Featured snippet", "A highlighted answer box shown above organic results."],
  ["People also ask", "Expandable questions related to the query."],
  ["Knowledge panel", "A knowledge-graph info box about the subject."],
  ["Local pack", "A map-based local business results block."],
  ["Images", "An image results block on the results page."],
  ["Video", "A video results block on the results page."],
  ["Top stories", "A news headlines block on the results page."],
  ["News", "A news results block on the results page."],
  ["Shopping", "A shopping or product listings block on the results page."],
  ["Discussions", "A discussions and forums block on the results page."],
  ["Recipes", "A recipe results block on the results page."],
  ["Events", "An events results block on the results page."],
  ["Related searches", "Related search queries shown at the bottom."],
  ["Ads", "Sponsored ad placements on the results page."],
];

const FEATURE_ORDER = FEATURE_CATALOG.map(([label]) => label);
const FEATURE_DESCRIPTIONS: Record<string, string> = Object.fromEntries(FEATURE_CATALOG);

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function featureChips(features: readonly string[]): FeatureChip[] {
  const seen = new Map<string, string>();
  for (const raw of features) {
    const key = raw.toLowerCase();
    const label = FEATURE_MAP[key] ?? capitalize(raw);
    if (!seen.has(label)) seen.set(label, FEATURE_DESCRIPTIONS[label] ?? "");
  }
  const ordered: FeatureChip[] = [];
  for (const label of FEATURE_ORDER) {
    if (seen.has(label)) {
      ordered.push({ label, description: seen.get(label) as string });
      seen.delete(label);
    }
  }
  for (const [label, description] of seen) {
    ordered.push({ label, description });
  }
  return ordered;
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
}): { heading: string; count: string; reason: string } | null {
  const { requestedDepth: depth, retrievedPositions: got, stoppedAtResult } = input;
  if (depth === null || got >= depth) return null;
  return {
    heading: `Positions ${got + 1}-${depth}`,
    count: `${depth - got} not retrieved`,
    reason: stoppedAtResult
      ? "The check stopped at your result, so these positions were never requested and never billed. They are unknown for this check, not empty."
      : "These positions were not retrieved for this check. They are unknown, not empty.",
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
  chip: string;
  tip: string;
};

export type CompareResult =
  | {
      kind: "list";
      overlap: number;
      rows: CompareRow[];
      stats: Record<CompareState, number>;
      overlapNote: string;
      tailNote: string;
    }
  | { kind: "degenerate"; note: string }
  | { kind: "refused"; eyebrow: string; title: string; body: string; rule: string };

/** A site can hold two organic results; the domain-keyed view uses its best, as the compact tier does. */
function keepBest(map: Map<string, number>, row: RetrievedRow) {
  const current = map.get(row.domain);
  if (current === undefined || row.position < current) map.set(row.domain, row.position);
}

export function compareChecks(
  from: RetrievedResults,
  to: RetrievedResults,
  options: {
    formatDate: (iso: string) => string;
    fullCheckDates: readonly string[];
  },
): CompareResult {
  const { formatDate, fullCheckDates } = options;

  if (from.tier !== "full" || to.tier !== "full") {
    const offender = from.tier !== "full" ? from : to;
    const body =
      offender.tier === "compact"
        ? `The ${formatDate(offender.checkedAt)} check is older than the full-detail window: one row per domain with its best position is all that survives. Lined up against a full check it would report domains entering and dropping out that never moved, only lost detail.`
        : `The ${formatDate(offender.checkedAt)} check has no stored results at all, so there is nothing to line up against the other one.`;
    let rule = "Pick two checks that both hold full detail.";
    if (fullCheckDates.length > 0) {
      const formatted = fullCheckDates.map(formatDate);
      const joined =
        formatted.length === 1
          ? formatted[0]
          : `${formatted.slice(0, -1).join(", ")} and ${formatted.at(-1)}`;
      rule = `${rule} ${joined} do.`;
    }
    return {
      kind: "refused",
      eyebrow: "COMPARISON NOT POSSIBLE",
      title: "These two checks cannot be compared",
      body,
      rule,
    };
  }

  const overlap = Math.min(from.retrievedPositions, to.retrievedPositions);

  if (overlap < 3) {
    const fp = from.trackedPosition;
    const tp = to.trackedPosition;
    if (fp !== null && tp !== null && tp < fp) {
      return {
        kind: "degenerate",
        note: `You moved up from #${fp} to #${tp}. The later check stopped there, so the positions you passed were not retrieved again and their movement cannot be shown.`,
      };
    }
    return {
      kind: "degenerate",
      note: "The two checks overlap over fewer than three positions, so there is nothing to compare.",
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
  const boundingLabel = bounding === to ? "later" : "earlier";
  const boundReason = bounding.stoppedAtResult
    ? `The ${boundingLabel} check stopped at your result, so deeper positions were not retrieved.`
    : `The ${boundingLabel} check retrieved only ${overlap} positions.`;

  for (const [domain, toPos] of toMap) {
    const fromPos = fromMap.get(domain);
    if (fromPos === undefined) {
      rows.push({
        domain,
        state: "entered",
        delta: 0,
        from: null,
        to: toPos,
        chip: "entered",
        tip: `Was not in positions 1-${overlap} at the earlier check.`,
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
        chip: `up ${delta}`,
        tip: `Moved up ${delta} positions.`,
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
        chip: `down ${delta}`,
        tip: `Moved down ${delta} positions.`,
      });
      stats.down++;
    } else {
      rows.push({
        domain,
        state: "unchanged",
        delta: 0,
        from: fromPos,
        to: toPos,
        chip: "unchanged",
        tip: "Held the same position.",
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
        chip: "dropped out",
        tip: `No longer in positions 1-${overlap}. ${boundReason}`,
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
    overlapNote: `Compared over positions 1-${overlap}, the depth both checks retrieved.`,
    tailNote: `Below #${overlap} there is nothing to compare: ${boundReason}`,
  };
}
