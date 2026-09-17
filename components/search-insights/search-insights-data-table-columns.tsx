import {
  formatRowCount,
  formatRowCtr,
  formatRowPosition,
  positionClassName,
} from "@/components/search-insights/search-insights-rows-model";
import { Button } from "@/components/ui/Button";
import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import type { SearchInsightsQueryRow } from "@/lib/search-insights/queries/top-rows-model";
import { trackedKey } from "@/lib/search-insights/queries/tracked-model";
import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/dist/csr/CaretRight";
import type { useTranslations } from "next-intl";

export type SearchInsightsQueryDataTableRow = SearchInsightsQueryRow & { id: string };

type SearchInsightsQueryColumnsOptions = {
  adding: ReadonlySet<string>;
  locale: string;
  onTrack?: (row: SearchInsightsQueryRow) => void;
  sortable: boolean;
  t: ReturnType<typeof useTranslations<"projectSearchInsights.copy">>;
  tracked: ReadonlySet<string>;
};

const QUICK_ACTION =
  "opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-solid pointer-coarse:hidden";
const COARSE_CARET = "hidden opacity-60 pointer-coarse:inline-block";
const NUMBER = "font-sans tabular-nums text-ui-caption";

function QueryActions({
  adding,
  onTrack,
  row,
  t,
  tracked,
}: Readonly<{
  adding: ReadonlySet<string>;
  onTrack?: (row: SearchInsightsQueryRow) => void;
  row: SearchInsightsQueryDataTableRow;
  t: ReturnType<typeof useTranslations<"projectSearchInsights.copy">>;
  tracked: ReadonlySet<string>;
}>) {
  const isTracked = tracked.has(trackedKey(row.query));
  if (isTracked || adding.has(row.query)) {
    return (
      <span
        className="inline-flex items-center font-sans tabular-nums text-ui-micro text-fg-muted"
        title={isTracked ? t("trackedTitle") : undefined}
      >
        {isTracked ? t("tracked") : t("adding")}
      </span>
    );
  }
  return (
    <>
      <Button
        className={QUICK_ACTION}
        onClick={() => onTrack?.(row)}
        size="xs"
        title={t("trackTitle")}
        variant="secondary"
      >
        {t("track")}
      </Button>
      <CaretRight aria-hidden className={COARSE_CARET} size={12} weight="regular" />
    </>
  );
}

export function searchInsightsQueryColumns({
  adding,
  locale,
  onTrack,
  sortable,
  t,
  tracked,
}: SearchInsightsQueryColumnsOptions): readonly DataTableColumn<SearchInsightsQueryDataTableRow>[] {
  return [
    {
      accessorKey: "query",
      cell: ({ row }) => (
        <span className="block truncate" title={row.original.query}>
          {row.original.query}
        </span>
      ),
      header: t("query"),
      id: "text",
      meta: { flex: 1, sortField: "text", sortable, title: t("query") },
      minSize: 160,
      size: 200,
    },
    {
      accessorKey: "clicks",
      cell: ({ row }) => (
        <span className={`${NUMBER} font-semibold`}>
          {formatRowCount(row.original.clicks, locale)}
        </span>
      ),
      header: t("clicks"),
      id: "clicks",
      meta: { align: "end", sortField: "clicks", sortable, title: t("clicks") },
      minSize: 80,
      size: 80,
      sortDescFirst: true,
    },
    {
      accessorKey: "impressions",
      cell: ({ row }) => (
        <span className={`${NUMBER} text-fg-muted`}>
          {formatRowCount(row.original.impressions, locale)}
        </span>
      ),
      header: t("impressionsShort"),
      id: "impressions",
      meta: { align: "end", sortField: "impressions", sortable, title: t("impressions") },
      minSize: 72,
      size: 72,
      sortDescFirst: true,
    },
    {
      accessorKey: "ctr",
      cell: ({ row }) => (
        <span className={`${NUMBER} text-fg-muted`}>{formatRowCtr(row.original.ctr, locale)}</span>
      ),
      header: t("ctr"),
      id: "ctr",
      meta: { align: "end", sortField: "ctr", sortable, title: t("ctr") },
      minSize: 64,
      size: 64,
      sortDescFirst: true,
    },
    {
      accessorKey: "position",
      cell: ({ row }) => (
        <span className={`${NUMBER} ${positionClassName(row.original.position)}`}>
          {formatRowPosition(row.original.position, locale)}
        </span>
      ),
      header: t("averagePosition"),
      id: "position",
      meta: { align: "end", sortField: "position", sortable, title: t("avgPositionTip") },
      minSize: 88,
      size: 88,
    },
    {
      cell: ({ row }) => (
        <QueryActions
          adding={adding}
          onTrack={onTrack}
          row={row.original}
          t={t}
          tracked={tracked}
        />
      ),
      enableSorting: false,
      header: () => <span className="sr-only">{t("actions")}</span>,
      id: "actions",
      meta: { align: "end", lockResize: true, title: t("actions") },
      minSize: 96,
      size: 96,
    },
  ];
}
