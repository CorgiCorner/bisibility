import {
  AVG_POSITION_TIP,
  DRAWER_PAGE_ENGAGEMENT_TIP,
  ENGAGEMENT_LABEL,
  ENGAGEMENT_RATE_TIP,
  KEY_EVENTS_LABEL,
  KEY_EVENTS_TIP,
  overlapBadgeTitle,
} from "@/components/search-insights/search-insights-copy";
import {
  formatRowCount,
  formatRowCtr,
  formatRowPosition,
} from "@/components/search-insights/search-insights-rows-model";
import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import type { SearchInsightsBandRow } from "@/lib/search-insights/queries/band-list";
import type { SearchInsightsOverlapRow } from "@/lib/search-insights/queries/overlap-list";
import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/dist/csr/CaretRight";

export type DrawerRow = {
  clicks: number;
  engagementRate?: number | null;
  key: string;
  keyEvents?: number | null;
  label: string;
  onOpen: () => void;
  position: number | null;
  title: string;
};

export type DrawerSliceDataTableRow = DrawerRow & { id: string };
export type DrawerBandDataTableRow = SearchInsightsBandRow & { id: string };
export type DrawerOverlapChildRow = {
  clicks: number;
  id: string;
  path: string;
  url: string;
};
type DrawerOverlapParentRow = {
  clicks: number;
  id: string;
  kind: "group";
  pages: number;
  position: number | null;
  query: string;
  subRows: readonly DrawerOverlapChildRow[];
};
export type DrawerOverlapDataTableRow = DrawerOverlapParentRow | DrawerOverlapChildRow;

const TEXT = "block truncate font-sans tabular-nums text-ui-caption";
const NUMBER = "font-sans tabular-nums text-ui-caption font-semibold";
const MUTED = "font-sans tabular-nums text-ui-caption text-fg-muted";
const DECISION =
  "inline-flex items-center justify-end gap-1.5 font-sans tabular-nums text-ui-caption text-fg-muted";

function decision(value: string) {
  return (
    <span className={DECISION}>
      {value}
      <CaretRight aria-hidden className="shrink-0" size={11} weight="regular" />
    </span>
  );
}

export function drawerSliceColumns({
  keyEventsConfigured,
  showPageMetrics,
  textHeader,
}: {
  keyEventsConfigured: boolean | null;
  showPageMetrics: boolean;
  textHeader: "Page" | "Query";
}): readonly DataTableColumn<DrawerSliceDataTableRow>[] {
  const columns: DataTableColumn<DrawerSliceDataTableRow>[] = [
    {
      accessorKey: "label",
      cell: ({ row }) => (
        <span className={TEXT} title={row.original.title}>
          {row.original.label}
        </span>
      ),
      header: textHeader,
      id: "text",
      meta: { flex: 1, lockResize: true, title: textHeader },
      minSize: 160,
      size: 176,
    },
    {
      accessorKey: "clicks",
      cell: ({ row }) => <span className={NUMBER}>{formatRowCount(row.original.clicks)}</span>,
      header: "Clicks",
      id: "clicks",
      meta: { align: "end", lockResize: true, title: "Clicks" },
      minSize: 80,
      size: 80,
    },
  ];
  if (showPageMetrics) {
    columns.push(
      {
        accessorKey: "engagementRate",
        cell: ({ row }) => (
          <span
            className={MUTED}
            title={row.original.engagementRate == null ? ENGAGEMENT_RATE_TIP : undefined}
          >
            {row.original.engagementRate == null ? "-" : formatRowCtr(row.original.engagementRate)}
          </span>
        ),
        header: ENGAGEMENT_LABEL,
        id: "engagement",
        meta: {
          align: "end",
          lockResize: true,
          title: DRAWER_PAGE_ENGAGEMENT_TIP,
        },
        minSize: 104,
        size: 104,
      },
      {
        accessorKey: "keyEvents",
        cell: ({ row }) => (
          <span
            className={MUTED}
            title={
              row.original.keyEvents == null && keyEventsConfigured !== false
                ? KEY_EVENTS_TIP
                : undefined
            }
          >
            {keyEventsConfigured === false || row.original.keyEvents == null
              ? "-"
              : formatRowCount(row.original.keyEvents)}
          </span>
        ),
        header: KEY_EVENTS_LABEL,
        id: "key-events",
        meta: { align: "end", lockResize: true, title: KEY_EVENTS_TIP },
        minSize: 92,
        size: 92,
      },
    );
  }
  columns.push({
    accessorKey: "position",
    cell: ({ row }) =>
      decision(row.original.position === null ? "-" : formatRowPosition(row.original.position)),
    header: "Avg pos",
    id: "position",
    meta: { align: "end", lockResize: true, title: AVG_POSITION_TIP },
    minSize: 88,
    size: 88,
  });
  return columns;
}

export const drawerBandColumns: readonly DataTableColumn<DrawerBandDataTableRow>[] = [
  {
    accessorKey: "query",
    cell: ({ row }) => (
      <span className={TEXT} title={row.original.query}>
        {row.original.query}
      </span>
    ),
    header: "Query",
    id: "text",
    meta: { flex: 1, lockResize: true, title: "Query" },
    minSize: 160,
    size: 176,
  },
  {
    accessorKey: "clicks",
    cell: ({ row }) => <span className={NUMBER}>{formatRowCount(row.original.clicks)}</span>,
    header: "Clicks",
    id: "clicks",
    meta: { align: "end", lockResize: true, title: "Clicks" },
    minSize: 80,
    size: 80,
  },
  {
    accessorKey: "impressions",
    cell: ({ row }) => <span className={MUTED}>{formatRowCount(row.original.impressions)}</span>,
    header: "Impr",
    id: "impressions",
    meta: { align: "end", lockResize: true, title: "Impressions" },
    minSize: 72,
    size: 72,
  },
  {
    accessorKey: "position",
    cell: ({ row }) => decision(formatRowPosition(row.original.position)),
    header: "Avg pos",
    id: "position",
    meta: { align: "end", lockResize: true, title: AVG_POSITION_TIP },
    minSize: 88,
    size: 88,
  },
];

export const drawerOverlapColumns: readonly DataTableColumn<DrawerOverlapDataTableRow>[] = [
  {
    accessorFn: (row) => ("query" in row ? row.query : row.path),
    cell: ({ row }) =>
      "query" in row.original ? (
        <span className="flex min-w-0 items-center gap-2">
          <span className={TEXT} title={row.original.query}>
            {row.original.query}
          </span>
          <span
            className="shrink-0 rounded-control border border-border px-1.5 font-sans tabular-nums text-ui-micro text-fg-muted"
            title={overlapBadgeTitle(row.original.pages)}
          >
            x{row.original.pages}
          </span>
        </span>
      ) : (
        <span
          className="block truncate font-sans tabular-nums text-ui-micro text-fg-muted"
          title={row.original.url}
        >
          {row.original.path}
        </span>
      ),
    header: "Query",
    id: "text",
    meta: { flex: 1, lockResize: true, title: "Query" },
    minSize: 160,
    size: 176,
  },
  {
    accessorKey: "clicks",
    cell: ({ row }) => (
      <span className={"query" in row.original ? NUMBER : MUTED}>
        {formatRowCount(row.original.clicks)}
      </span>
    ),
    header: "Clicks",
    id: "clicks",
    meta: { align: "end", lockResize: true, title: "Clicks" },
    minSize: 80,
    size: 80,
  },
  {
    accessorFn: (row) => ("position" in row ? row.position : null),
    cell: ({ row }) =>
      "position" in row.original
        ? decision(row.original.position === null ? "-" : formatRowPosition(row.original.position))
        : null,
    header: "Avg pos",
    id: "position",
    meta: { align: "end", lockResize: true, title: AVG_POSITION_TIP },
    minSize: 88,
    size: 88,
  },
];

export function drawerOverlapRows(
  rows: readonly SearchInsightsOverlapRow[],
): DrawerOverlapParentRow[] {
  return rows.map((row) => ({
    clicks: row.clicks,
    id: row.query,
    kind: "group",
    pages: row.pages,
    position: row.position,
    query: row.query,
    subRows: row.split.map((page) => ({ ...page, id: `${row.query}:${page.url}` })),
  }));
}
