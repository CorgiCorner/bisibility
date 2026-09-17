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
import type { useTranslations } from "next-intl";

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

export type SearchInsightsDrawerPresentation = {
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  t: ReturnType<typeof useTranslations<"projectSearchInsights.copy">>;
};

function formatCount(presentation: SearchInsightsDrawerPresentation, value: number) {
  return presentation.formatNumber(value, { maximumFractionDigits: 0 });
}

function listKicker(which: SearchInsightsListKind, presentation: SearchInsightsDrawerPresentation) {
  return which === "band"
    ? presentation.t("drawerBandKicker", { max: POSITION_BAND.max, min: POSITION_BAND.min })
    : presentation.t("drawerOverlapKicker");
}

function listTitle(
  which: SearchInsightsListKind,
  count: number,
  presentation: SearchInsightsDrawerPresentation,
) {
  return which === "band"
    ? presentation.t("drawerListTitleBand", { count })
    : presentation.t("drawerListTitleOverlap", { count });
}

function listNote(which: SearchInsightsListKind, presentation: SearchInsightsDrawerPresentation) {
  return which === "band" ? presentation.t("drawerBandNote") : presentation.t("drawerOverlapNote");
}

/** The identity of a frame: what the visited marks are keyed by and what the cache holds. */
export function drawerFrameKey(frame: SearchInsightsDrawerFrame) {
  if (frame.kind === "list") return `list:${frame.which}`;
  if (frame.kind === "page") return `page:${frame.url}`;
  return `query:${frame.query}`;
}

/** What the arrow says: the title of the frame the customer would return to. */
export function drawerBackLabel(
  frame: SearchInsightsDrawerFrame,
  presentation: SearchInsightsDrawerPresentation,
) {
  if (frame.kind === "list") return listKicker(frame.which, presentation);
  return frame.kind === "page" ? frame.path : frame.query;
}

export function drawerKicker(
  frame: SearchInsightsDrawerFrame,
  presentation: SearchInsightsDrawerPresentation,
) {
  if (frame.kind === "list") return listKicker(frame.which, presentation);
  return frame.kind === "page"
    ? presentation.t("drawerPageKicker")
    : presentation.t("drawerQueryKicker");
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
  presentation: SearchInsightsDrawerPresentation,
) {
  if (frame.kind === "query") return frame.query;
  if (frame.kind === "page") return frame.path;
  const content = entry?.status === "ready" ? entry.content : null;
  const loaded = content?.kind === frame.which ? content.list.total : null;
  return listTitle(frame.which, loaded ?? counts[frame.which], presentation);
}

export function drawerListNote(
  which: SearchInsightsListKind,
  presentation: SearchInsightsDrawerPresentation,
) {
  return listNote(which, presentation);
}

export function drawerListPivot(
  which: SearchInsightsListKind,
  presentation: SearchInsightsDrawerPresentation,
) {
  return which === "band"
    ? {
        sortTip: presentation.t("drawerBandSortTip"),
        title: presentation.t("drawerBandPivotTitle"),
      }
    : {
        sortTip: presentation.t("drawerOverlapSortTip"),
        title: presentation.t("drawerOverlapPivotTitle"),
      };
}

export function drawerListEmptyCopy(
  which: SearchInsightsListKind,
  namedQueryCount: number,
  presentation: SearchInsightsDrawerPresentation,
) {
  const noMaterial = presentation.t("drawerNoMaterial");
  if (which === "band") {
    return {
      copy: namedQueryCount > 0 ? presentation.t("drawerBandEmpty") : noMaterial,
      definition: presentation.t("drawerBandDefinition"),
    };
  }
  return {
    copy: namedQueryCount > 0 ? presentation.t("drawerOverlapEmpty") : noMaterial,
    definition: presentation.t("drawerOverlapDefinition"),
  };
}

/** The pivot heading of a detail frame, which names what the rows below it are. */
export function drawerPivotHeading(
  content: SearchInsightsDrawerContent,
  presentation: SearchInsightsDrawerPresentation,
) {
  if (content.kind === "page") {
    const { queries } = content.detail;
    return {
      count:
        queries.total > 0
          ? `${formatCount(presentation, queries.rows.length)} of ${formatCount(presentation, queries.total)}`
          : null,
      note: null,
      title: presentation.t("drawerPagePivotTitle"),
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
          ? `${formatCount(presentation, shown)} of ${formatCount(presentation, total)}`
          : presentation.t("drawerQueryPageCount", { count: shown }),
      note: many ? presentation.t("drawerQueryOverlapNote") : null,
      title: many
        ? presentation.t("drawerQueryPagesTitle")
        : presentation.t("drawerQueryPageTitle"),
    };
  }
  const { list } = content;
  // A complete list needs no count: "8 of 8" only invites the reader to wonder what was left out.
  const truncated = list.rows.length < list.total;
  return {
    count: truncated
      ? `${formatCount(presentation, list.rows.length)} of ${formatCount(presentation, list.total)}`
      : null,
    note: drawerListNote(content.kind, presentation),
    title: drawerListPivot(content.kind, presentation).title,
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
export function drawerBars(
  perDay: readonly SearchInsightsDay[],
  presentation: SearchInsightsDrawerPresentation,
): DrawerBar[] {
  const peak = perDay.reduce((highest, day) => Math.max(highest, day.clicks), 0);
  return perDay.map((day) => ({
    date: day.date,
    // 2% is the hairline used when every day is empty. A zero day next to a peak must keep
    // that same baseline; otherwise one clicky day collapses the rest to 0px.
    height: peak > 0 && day.clicks > 0 ? Math.round((day.clicks / peak) * 100) : 2,
    title: presentation.t("drawerClickCount", { count: day.clicks }),
  }));
}

/**
 * Whether a list drawer still has rows the customer has not been shown, under the same rule the
 * tables follow: one click may build at most the cap, so past it the label says so and once the
 * list holds the cap the control goes away rather than re-reading the same rows.
 */
export function drawerShowAllLabel(
  list: SearchInsightsList<unknown>,
  presentation: SearchInsightsDrawerPresentation,
) {
  if (list.rows.length >= Math.min(list.total, DRAWER_LIST_CAP)) return null;
  return list.total > DRAWER_LIST_CAP
    ? presentation.t("showTopCount", { count: DRAWER_LIST_CAP })
    : presentation.t("showAllCount", { count: list.total });
}

export function drawerShowAllTitle(
  list: SearchInsightsList<unknown>,
  presentation: SearchInsightsDrawerPresentation,
) {
  return list.total > DRAWER_LIST_CAP
    ? presentation.t("drawerCapTitle", { count: DRAWER_LIST_CAP })
    : presentation.t("showMoreTitle");
}

/** The four numbers above the bars, in the design's order. */
export function drawerStatCards(
  stats: SearchInsightsStats,
  presentation: SearchInsightsDrawerPresentation,
) {
  return [
    { label: presentation.t("metricClicks"), value: formatCount(presentation, stats.clicks) },
    {
      label: presentation.t("impressionsShort"),
      value: formatCount(presentation, stats.impressions),
    },
    {
      label: presentation.t("metricCtr"),
      value: presentation.formatNumber(stats.ctr, {
        maximumFractionDigits: 1,
        minimumFractionDigits: 1,
        style: "percent",
      }),
    },
    {
      label: presentation.t("averagePosition"),
      value: presentation.formatNumber(stats.position, {
        maximumFractionDigits: 1,
        minimumFractionDigits: 1,
      }),
    },
  ];
}

/** The label beside the bars. Every day of the window is finalized, and it says so. */
export function drawerWindowLabel(days: number, presentation: SearchInsightsDrawerPresentation) {
  return presentation.t("drawerFinalizedDay", { count: days });
}

export function drawerMeasuredZeroLine(
  days: number,
  presentation: SearchInsightsDrawerPresentation,
) {
  if (days === 1) {
    return presentation.t("drawerNoClicksOne");
  }
  return presentation.t("drawerNoClicksMany", { days });
}

export function drawerPagePivotEmptyCopy(
  detail: SearchInsightsPageDetail,
  presentation: SearchInsightsDrawerPresentation,
) {
  const impressions = detail.stats.impressions;
  if (impressions <= 0) return presentation.t("drawerNoNamedQueries");
  return presentation.t("drawerNoNamedQueriesPrivacy", { impressions });
}
