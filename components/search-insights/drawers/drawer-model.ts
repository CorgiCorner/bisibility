import {
  DRAWER_COPY,
  DRAWER_STAT_LABELS,
  SHOW_MORE_TITLE,
} from "@/components/search-insights/search-insights-copy";
import {
  formatRowCount,
  formatRowCtr,
  reachLabel,
} from "@/components/search-insights/search-insights-rows-model";
import { DRAWER_LIST_CAP, POSITION_BAND } from "@/lib/search-insights/constants";
import type { SearchInsightsBandRow } from "@/lib/search-insights/queries/band-list";
import type {
  SearchInsightsDay,
  SearchInsightsList,
  SearchInsightsStats,
} from "@/lib/search-insights/queries/detail-model";
import type { SearchInsightsOverlapRow } from "@/lib/search-insights/queries/overlap-list";
import type { SearchInsightsPageDetail } from "@/lib/search-insights/queries/page-detail";
import type { SearchInsightsQueryDetail } from "@/lib/search-insights/queries/query-detail";

export type SearchInsightsListKind = "band" | "overlap";

export type SearchInsightsDrawerFrame =
  | { kind: "list"; which: SearchInsightsListKind }
  | { kind: "page"; path: string; url: string }
  | { kind: "query"; query: string };

export type SearchInsightsDrawerContent =
  | { detail: SearchInsightsPageDetail; kind: "page" }
  | { detail: SearchInsightsQueryDetail; kind: "query" }
  | { kind: "band"; list: SearchInsightsList<SearchInsightsBandRow> }
  | { kind: "overlap"; list: SearchInsightsList<SearchInsightsOverlapRow> };

export type SearchInsightsDrawerEntry =
  | { content: SearchInsightsDrawerContent; status: "ready" }
  | { status: "failed" }
  | { status: "loading" };

/** Counts the chips already show, so a list drawer can title itself before its rows arrive. */
export type SearchInsightsListCounts = Record<SearchInsightsListKind, number>;

export const BAND_KICKER = `Positions ${POSITION_BAND.min} to ${POSITION_BAND.max}`;
export const OVERLAP_KICKER = "Page overlap";

const LIST_KICKER: Record<SearchInsightsListKind, string> = {
  band: BAND_KICKER,
  overlap: OVERLAP_KICKER,
};

const LIST_TITLE: Record<SearchInsightsListKind, (count: number) => string> = {
  band: (count) => `${count.toLocaleString("en-US")} queries ranking below the top three`,
  overlap: (count) => `${count.toLocaleString("en-US")} queries answered by more than one page`,
};

const LIST_NOTE: Record<SearchInsightsListKind, string> = {
  band: DRAWER_COPY.bandNote,
  overlap: DRAWER_COPY.overlapNote,
};

const LIST_PIVOT_TITLE: Record<SearchInsightsListKind, string> = {
  band: DRAWER_COPY.bandPivotTitle,
  overlap: DRAWER_COPY.overlapPivotTitle,
};

const LIST_SORT_TIP: Record<SearchInsightsListKind, string> = {
  band: DRAWER_COPY.bandSortTip,
  overlap: DRAWER_COPY.overlapSortTip,
};

/** The identity of a frame: what the visited marks are keyed by and what the cache holds. */
export function drawerFrameKey(frame: SearchInsightsDrawerFrame) {
  if (frame.kind === "list") return `list:${frame.which}`;
  if (frame.kind === "page") return `page:${frame.url}`;
  return `query:${frame.query}`;
}

/** What the arrow says: the title of the frame the customer would return to. */
export function drawerBackLabel(frame: SearchInsightsDrawerFrame) {
  if (frame.kind === "list") return LIST_KICKER[frame.which];
  return frame.kind === "page" ? frame.path : frame.query;
}

export function drawerKicker(frame: SearchInsightsDrawerFrame) {
  if (frame.kind === "list") return LIST_KICKER[frame.which];
  return frame.kind === "page" ? DRAWER_COPY.pageKicker : DRAWER_COPY.queryKicker;
}

export function drawerGoogleSearchHref(query: string) {
  const url = new URL("https://www.google.com/search");
  url.searchParams.set("q", query);
  return url.toString();
}

export function drawerTitle(
  frame: SearchInsightsDrawerFrame,
  entry: SearchInsightsDrawerEntry | undefined,
  counts: SearchInsightsListCounts,
) {
  if (frame.kind === "query") return frame.query;
  if (frame.kind === "page") return frame.path;
  const content = entry?.status === "ready" ? entry.content : null;
  const loaded = content?.kind === frame.which ? content.list.total : null;
  return LIST_TITLE[frame.which](loaded ?? counts[frame.which]);
}

export function drawerListNote(which: SearchInsightsListKind) {
  return LIST_NOTE[which];
}

export function drawerListPivot(which: SearchInsightsListKind) {
  return { sortTip: LIST_SORT_TIP[which], title: LIST_PIVOT_TITLE[which] };
}

export function drawerListEmptyCopy(which: SearchInsightsListKind, namedQueryCount: number) {
  const noMaterial =
    "Nothing to show yet. This list needs named queries in the window, and Google has named none so far.";
  if (which === "band") {
    return {
      copy:
        namedQueryCount > 0
          ? "None of your named queries sit at positions 4 to 20 - everything Google names ranks in the top three."
          : noMaterial,
      definition: "This list tracks queries where demand exists but rank can improve.",
    };
  }
  return {
    copy:
      namedQueryCount > 0
        ? "No query is answered by more than one page in this window - no overlap signal."
        : noMaterial,
    definition: "This list tracks queries where more than one of your pages appears.",
  };
}

/** The pivot heading of a detail frame, which names what the rows below it are. */
export function drawerPivotHeading(content: SearchInsightsDrawerContent) {
  if (content.kind === "page") {
    const { queries } = content.detail;
    return {
      count:
        queries.total > 0
          ? `${queries.rows.length.toLocaleString("en-US")} of ${queries.total.toLocaleString("en-US")}`
          : null,
      note: null,
      title: DRAWER_COPY.pagePivotTitle,
    };
  }
  if (content.kind === "query") {
    const { rows, total } = content.detail.pages;
    // The count describes the rows on screen. A query answered by more pages than the pivot
    // carries says so as "15 of 34" rather than asserting a number it silently truncated.
    const shown = rows.length;
    const many = shown > 1;
    return {
      count:
        shown < total
          ? `${shown.toLocaleString("en-US")} of ${total.toLocaleString("en-US")}`
          : `${shown.toLocaleString("en-US")} ${many ? "pages" : "page"}`,
      note: many ? DRAWER_COPY.queryOverlapNote : null,
      title: many ? DRAWER_COPY.queryPagesTitle : DRAWER_COPY.queryPageTitle,
    };
  }
  const { list } = content;
  // A complete list needs no count: "8 of 8" only invites the reader to wonder what was left out.
  const truncated = list.rows.length < list.total;
  return {
    count: truncated
      ? `${list.rows.length.toLocaleString("en-US")} of ${list.total.toLocaleString("en-US")}`
      : null,
    note: drawerListNote(content.kind),
    title: drawerListPivot(content.kind).title,
  };
}

export type DrawerBar = {
  date: string;
  /** Share of the busiest day of the window, as a percentage of the chart height. */
  height: number;
  title: string;
};

/**
 * One bar per day of the selected window, so the bar count and the window label can never
 * disagree. Every day in the window is finalized, which is why none of them is drawn as
 * provisional.
 */
export function drawerBars(perDay: readonly SearchInsightsDay[]): DrawerBar[] {
  const peak = perDay.reduce((highest, day) => Math.max(highest, day.clicks), 0);
  return perDay.map((day) => ({
    date: day.date,
    // 2% is the hairline used when every day is empty. A zero day next to a peak must keep
    // that same baseline; otherwise one clicky day collapses the rest to 0px.
    height: peak > 0 && day.clicks > 0 ? Math.round((day.clicks / peak) * 100) : 2,
    title: `${day.clicks.toLocaleString("en-US")} clicks`,
  }));
}

/**
 * Whether a list drawer still has rows the customer has not been shown, under the same rule the
 * tables follow: one click may build at most the cap, so past it the label says so and once the
 * list holds the cap the control goes away rather than re-reading the same rows.
 */
export function drawerShowAllLabel(list: SearchInsightsList<unknown>) {
  return reachLabel(list.rows.length, list.total, DRAWER_LIST_CAP);
}

export function drawerShowAllTitle(list: SearchInsightsList<unknown>) {
  return list.total > DRAWER_LIST_CAP ? DRAWER_COPY.capTitle : SHOW_MORE_TITLE;
}

/** The four numbers above the bars, in the design's order. */
export function drawerStatCards(stats: SearchInsightsStats) {
  return [
    { label: DRAWER_STAT_LABELS[0], value: formatRowCount(stats.clicks) },
    { label: DRAWER_STAT_LABELS[1], value: formatRowCount(stats.impressions) },
    { label: DRAWER_STAT_LABELS[2], value: formatRowCtr(stats.ctr) },
    { label: DRAWER_STAT_LABELS[3], value: stats.position.toFixed(1) },
  ];
}

/** The label beside the bars. Every day of the window is finalized, and it says so. */
export function drawerWindowLabel(days: number) {
  if (days === 1) return "1 finalized day";
  return `${days.toLocaleString("en-US")} finalized days`;
}

export function drawerMeasuredZeroLine(days: number) {
  if (days === 1) {
    return "No clicks on this 1 day. The impressions above are views without a click.";
  }
  return `No clicks on any of these ${days.toLocaleString("en-US")} days. The impressions above are views without a click.`;
}

export function drawerPagePivotEmptyCopy(detail: SearchInsightsPageDetail) {
  const impressions = detail.stats.impressions;
  if (impressions <= 0) return "No named queries for this page in the selected period.";
  const measured =
    impressions === 1
      ? "the 1 impression"
      : `all ${impressions.toLocaleString("en-US")} impressions`;
  return `No named queries for this page. Google hides low-volume query text for privacy - ${measured} came from queries it does not name.`;
}
