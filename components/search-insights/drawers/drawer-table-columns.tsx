import {
  formatRowCount,
  formatRowCtr,
  formatRowPosition,
} from "@/components/search-insights/search-insights-rows-model";
import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import type { SearchInsightsBandRow } from "@/lib/search-insights/queries/band-list";
import type { SearchInsightsOverlapRow } from "@/lib/search-insights/queries/overlap-list";
import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/dist/csr/CaretRight";
import type { useTranslations } from "next-intl";

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

type Translate = ReturnType<typeof useTranslations<"projectSearchInsights.copy">>;

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
  locale,
  showPageMetrics,
  textHeader,
  t,
}: {
  keyEventsConfigured: boolean | null;
  locale: string;
  showPageMetrics: boolean;
  textHeader: string;
  t: Translate;
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
      cell: ({ row }) => (
        <span className={NUMBER}>{formatRowCount(row.original.clicks, locale)}</span>
      ),
      header: t("clicks"),
      id: "clicks",
      meta: { align: "end", lockResize: true, title: t("clicks") },
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
            title={row.original.engagementRate == null ? t("engagementRateTip") : undefined}
          >
            {row.original.engagementRate == null
              ? "-"
              : formatRowCtr(row.original.engagementRate, locale)}
          </span>
        ),
        header: t("engagement"),
        id: "engagement",
        meta: {
          align: "end",
          lockResize: true,
          title: t("drawerPageEngagementTip"),
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
                ? t("keyEventsTip")
                : undefined
            }
          >
            {keyEventsConfigured === false || row.original.keyEvents == null
              ? "-"
              : formatRowCount(row.original.keyEvents, locale)}
          </span>
        ),
        header: t("keyEvents"),
        id: "key-events",
        meta: { align: "end", lockResize: true, title: t("keyEventsTip") },
        minSize: 92,
        size: 92,
      },
    );
  }
  columns.push({
    accessorKey: "position",
    cell: ({ row }) =>
      decision(
        row.original.position === null ? "-" : formatRowPosition(row.original.position, locale),
      ),
    header: t("averagePosition"),
    id: "position",
    meta: { align: "end", lockResize: true, title: t("avgPositionTip") },
    minSize: 88,
    size: 88,
  });
  return columns;
}

export function drawerBandColumns({
  locale,
  t,
}: {
  locale: string;
  t: Translate;
}): readonly DataTableColumn<DrawerBandDataTableRow>[] {
  return [
    {
      accessorKey: "query",
      cell: ({ row }) => (
        <span className={TEXT} title={row.original.query}>
          {row.original.query}
        </span>
      ),
      header: t("query"),
      id: "text",
      meta: { flex: 1, lockResize: true, title: t("query") },
      minSize: 160,
      size: 176,
    },
    {
      accessorKey: "clicks",
      cell: ({ row }) => (
        <span className={NUMBER}>{formatRowCount(row.original.clicks, locale)}</span>
      ),
      header: t("clicks"),
      id: "clicks",
      meta: { align: "end", lockResize: true, title: t("clicks") },
      minSize: 80,
      size: 80,
    },
    {
      accessorKey: "impressions",
      cell: ({ row }) => (
        <span className={MUTED}>{formatRowCount(row.original.impressions, locale)}</span>
      ),
      header: t("impressionsShort"),
      id: "impressions",
      meta: { align: "end", lockResize: true, title: t("impressions") },
      minSize: 72,
      size: 72,
    },
    {
      accessorKey: "position",
      cell: ({ row }) => decision(formatRowPosition(row.original.position, locale)),
      header: t("averagePosition"),
      id: "position",
      meta: { align: "end", lockResize: true, title: t("avgPositionTip") },
      minSize: 88,
      size: 88,
    },
  ];
}

export function drawerOverlapColumns({
  locale,
  t,
}: {
  locale: string;
  t: Translate;
}): readonly DataTableColumn<DrawerOverlapDataTableRow>[] {
  return [
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
              title={t("drawerOverlapBadgeTitle", { pages: row.original.pages })}
            >
              {t("drawerOverlapBadge", { pages: row.original.pages })}
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
      header: t("query"),
      id: "text",
      meta: { flex: 1, lockResize: true, title: t("query") },
      minSize: 160,
      size: 176,
    },
    {
      accessorKey: "clicks",
      cell: ({ row }) => (
        <span className={"query" in row.original ? NUMBER : MUTED}>
          {formatRowCount(row.original.clicks, locale)}
        </span>
      ),
      header: t("clicks"),
      id: "clicks",
      meta: { align: "end", lockResize: true, title: t("clicks") },
      minSize: 80,
      size: 80,
    },
    {
      accessorFn: (row) => ("position" in row ? row.position : null),
      cell: ({ row }) =>
        "position" in row.original
          ? decision(
              row.original.position === null
                ? "-"
                : formatRowPosition(row.original.position, locale),
            )
          : null,
      header: t("averagePosition"),
      id: "position",
      meta: { align: "end", lockResize: true, title: t("avgPositionTip") },
      minSize: 88,
      size: 88,
    },
  ];
}

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
