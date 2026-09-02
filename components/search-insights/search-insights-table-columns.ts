import type { SearchInsightsSortKey } from "@/lib/search-insights/queries/top-rows-sort";
import { AVG_POSITION_TIP, SESSIONS_JOIN_TIP } from "./search-insights-copy";

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
  clicks: "60px",
  ctr: "52px",
  impressions: "69px",
  // Wide enough for the AVG POS header to stay on one line: a header that wraps is the only
  // one in the table that does, and the label is what the column is named by.
  position: "60px",
  sessions: "69px",
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
  clicks: "w-15",
  ctr: "w-13",
  impressions: "w-17.25",
  position: "w-15",
  sessions: "w-17.25",
  // The fluid column carries no width: with `table-layout: fixed` an unspecified column takes
  // whatever the fixed ones leave, and its floor lives on the table (see below), because a
  // min-width on a `<col>` is inert.
  text: "w-auto",
} as const satisfies Record<ModuleTableColumnName, string>;

// Sessions replaces impressions rather than squeezing a fifth numeric column next to a URL:
// clicks, CTR and position are the decision columns on a page row.
export const moduleTableColumnOrder = {
  drawer: ["text", "clicks", "position"],
  drawerBand: ["text", "clicks", "impressions", "bandPosition"],
  pages: ["text", "clicks", "impressions", "ctr", "position", "action"],
  pagesWithSessions: ["text", "clicks", "ctr", "position", "sessions", "action"],
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
  impressions: { align: true, label: "Impr" },
  position: {
    align: true,
    label: "Avg pos",
    title: AVG_POSITION_TIP,
  },
  sessions: {
    align: true,
    label: "Sessions",
    title: SESSIONS_JOIN_TIP,
  },
  text: {
    label: "Query",
    labels: { pages: "Page", pagesWithSessions: "Page" },
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
  drawer: "grid-cols-[minmax(138px,1fr)_60px_60px]",
  drawerBand: "grid-cols-[minmax(138px,1fr)_60px_69px_76px]",
  pages: "grid-cols-[minmax(138px,1fr)_60px_69px_52px_60px_95px]",
  pagesWithSessions: "grid-cols-[minmax(138px,1fr)_60px_52px_60px_69px_95px]",
  queries: "grid-cols-[minmax(138px,1fr)_60px_69px_52px_60px_95px]",
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
  drawer: "min-w-64.5",
  drawerBand: "min-w-85.75",
  pages: "min-w-118.5",
  pagesWithSessions: "min-w-118.5",
  queries: "min-w-118.5",
} as const satisfies Record<ModuleTableVariant, string>;

export function moduleTableColumnClasses(variant: ModuleTableVariant) {
  return moduleTableColumnOrder[variant].map((name) => MODULE_TABLE_COLUMN_CLASS[name]);
}
