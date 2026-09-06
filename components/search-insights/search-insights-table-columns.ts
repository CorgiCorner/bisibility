import type { SearchInsightsSortKey } from "@/lib/search-insights/queries/top-rows-sort";
import {
  AVG_POSITION_TIP,
  ENGAGEMENT_LABEL,
  ENGAGEMENT_RATE_TIP,
  KEY_EVENTS_LABEL,
  KEY_EVENTS_TIP,
  ORGANIC_SESSIONS_LABEL,
  SESSIONS_JOIN_TIP,
} from "./search-insights-copy";

/**
 * One column geometry for every table in the module. The text column is fluid so a long query
 * or path gets whatever is left; the numeric columns are fixed at the width their widest
 * plausible value needs, so two tables side by side line up and a number never reflows while
 * rows load. The trailing action slot is a real column: leave it out and every row spills its
 * quick action onto an implicit second grid row.
 */
export const MODULE_TABLE_COLUMN = {
  action: "95px",
  // The band list carries a caret and a visited dot beside the number, which the narrow
  // decision column has no room for.
  bandPosition: "76px",
  // Sans 10px eyebrow + 8px sort gap + 10px icon. 52px was enough for the label
  // alone; the control paints into Avg pos unless the column holds the gap too.
  clicks: "72px",
  ctr: "60px",
  // Sans 10px eyebrow, nowrap. 52px/60px held the figures; ENGAGEMENT and KEY EVENTS
  // paint into the next column unless the column holds the label.
  engagement: "92px",
  impressions: "69px",
  keyEvents: "84px",
  // Wide enough for AVG POS plus the sort gap and icon: 76px held the label on
  // one line, but gap-2 left the control painting into Actions.
  position: "84px",
  sessions: "76px",
  text: "minmax(138px,1fr)",
} as const;

export type ModuleTableColumnName = keyof typeof MODULE_TABLE_COLUMN;

/**
 * The same widths as utility classes, for the `<colgroup>` of a real table. The spacing scale
 * is four pixels a step, so every fixed width above lands on it exactly and no table in the
 * module needs an arbitrary value to reach its geometry.
 */
export const MODULE_TABLE_COLUMN_CLASS = {
  action: "w-23.75",
  bandPosition: "w-19",
  clicks: "w-18",
  ctr: "w-15",
  engagement: "w-23",
  impressions: "w-17.25",
  keyEvents: "w-21",
  position: "w-21",
  sessions: "w-19",
  // The fluid column carries no width: with `table-layout: fixed` an unspecified column takes
  // whatever the fixed ones leave, and its floor lives on the table (see below), because a
  // min-width on a `<col>` is inert.
  text: "w-auto",
} as const satisfies Record<ModuleTableColumnName, string>;

// The GA4 variants keep six columns: text, clicks, then the funnel values GA4 can fill, then
// the action. Search Console diagnostics take back a slot whenever the funnel has nothing to say.
export const moduleTableColumnOrder = {
  drawer: ["text", "clicks", "position"],
  drawerBand: ["text", "clicks", "impressions", "bandPosition"],
  drawerPages: ["text", "clicks", "engagement", "keyEvents", "position"],
  pages: ["text", "clicks", "impressions", "ctr", "position", "action"],
  pagesWithKeyEvents: ["text", "clicks", "sessions", "engagement", "keyEvents", "action"],
  pagesWithSessions: ["text", "clicks", "sessions", "engagement", "position", "action"],
  queries: ["text", "clicks", "impressions", "ctr", "position", "action"],
} as const satisfies Record<string, readonly ModuleTableColumnName[]>;

export type ModuleTableVariant = keyof typeof moduleTableColumnOrder;

export type ModuleTableHeader = {
  align?: boolean;
  label: string;
  /** The read's sort key, on the columns the read can order by. */
  sortKey?: SearchInsightsSortKey;
  title?: string;
};

/**
 * Sessions is deliberately absent. It is read by a second statement, keyed by a hash of the
 * landing path that only the application can derive, so the page query cannot order by it - see
 * `top-rows.ts`. A header with no key renders as a plain label rather than a control that would
 * sort the loaded page and misdescribe the rest of the window.
 */
const MODULE_TABLE_SORT_KEY: Partial<Record<ModuleTableColumnName, SearchInsightsSortKey>> = {
  clicks: "clicks",
  ctr: "ctr",
  impressions: "impressions",
  position: "position",
  text: "text",
};

type ModuleTableHeaderDescriptor = ModuleTableHeader & {
  labels?: Partial<Record<ModuleTableVariant, string>>;
};

// Headers follow the same order as their colgroup. The page text column is the only shared
// geometry whose visible label changes between variants.
const moduleTableHeaderByColumn = {
  action: { label: "Actions" },
  bandPosition: { align: true, label: "Avg pos", title: AVG_POSITION_TIP },
  clicks: { align: true, label: "Clicks" },
  ctr: { align: true, label: "CTR" },
  engagement: { align: true, label: ENGAGEMENT_LABEL, title: ENGAGEMENT_RATE_TIP },
  impressions: { align: true, label: "Impr" },
  keyEvents: { align: true, label: KEY_EVENTS_LABEL, title: KEY_EVENTS_TIP },
  position: {
    align: true,
    label: "Avg pos",
    title: AVG_POSITION_TIP,
  },
  sessions: {
    align: true,
    label: ORGANIC_SESSIONS_LABEL,
    title: SESSIONS_JOIN_TIP,
  },
  text: {
    label: "Query",
    labels: { pages: "Page", pagesWithKeyEvents: "Page", pagesWithSessions: "Page" },
  },
} as const satisfies Record<ModuleTableColumnName, ModuleTableHeaderDescriptor>;

export function moduleTableHeaders(variant: ModuleTableVariant): readonly ModuleTableHeader[] {
  return moduleTableColumnOrder[variant].map((name) => {
    const descriptor = moduleTableHeaderByColumn[name];
    const sortKey = MODULE_TABLE_SORT_KEY[name];
    const label =
      "labels" in descriptor
        ? ((descriptor.labels as Partial<Record<ModuleTableVariant, string>>)[variant] ??
          descriptor.label)
        : descriptor.label;
    return { ...descriptor, label, ...(sortKey ? { sortKey } : {}) };
  });
}

/**
 * The grid variants are written out rather than composed, because the stylesheet is built by
 * scanning source text: a template built at runtime produces a class nothing generated. The
 * test beside this file proves each one still matches the widths above.
 */
export const moduleTableColumns = {
  drawer: "grid-cols-[minmax(138px,1fr)_72px_84px]",
  drawerBand: "grid-cols-[minmax(138px,1fr)_72px_69px_76px]",
  drawerPages: "grid-cols-[minmax(138px,1fr)_72px_92px_84px_84px]",
  pages: "grid-cols-[minmax(138px,1fr)_72px_69px_60px_84px_95px]",
  pagesWithKeyEvents: "grid-cols-[minmax(138px,1fr)_72px_76px_92px_84px_95px]",
  pagesWithSessions: "grid-cols-[minmax(138px,1fr)_72px_76px_92px_84px_95px]",
  queries: "grid-cols-[minmax(138px,1fr)_72px_69px_60px_84px_95px]",
} as const satisfies Record<ModuleTableVariant, string>;

/**
 * The layout the two table cards stand in, and the one their skeleton reserves. The skeleton
 * exists to hold the space the rows arrive into, so the two cannot be allowed to drift apart.
 */
export const moduleTablesLayout =
  "grid grid-cols-1 items-start gap-3 min-[1340px]:grid-cols-[minmax(0,1.12fr)_minmax(0,0.88fr)]";

/**
 * The floor the fluid text column needs, summed over the variant and put on the `<table>`. The
 * fixed-layout algorithm reads widths from the columns and ignores a min-width there, so without
 * this the fixed columns win every squeeze and the query text is what collapses; with it the
 * table outgrows a narrow card and its wrapper scrolls instead. Written out rather than composed
 * for the same reason as the grid literals above, and checked against the widths by the test.
 */
export const moduleTableMinWidth = {
  drawer: "min-w-73.5",
  drawerBand: "min-w-88.75",
  drawerPages: "min-w-117.5",
  pages: "min-w-129.5",
  pagesWithKeyEvents: "min-w-139.25",
  pagesWithSessions: "min-w-139.25",
  queries: "min-w-129.5",
} as const satisfies Record<ModuleTableVariant, string>;

export function moduleTableColumnClasses(variant: ModuleTableVariant) {
  return moduleTableColumnOrder[variant].map((name) => MODULE_TABLE_COLUMN_CLASS[name]);
}
