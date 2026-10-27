import { Button } from "@/components/ui/Button";
import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import type { SearchInsightsQueryRow } from "@/lib/search-insights/queries/top-rows-model";
import { trackedKey } from "@/lib/search-insights/queries/tracked-model";
import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/dist/csr/CaretRight";
import type { useTranslations } from "next-intl";
import { searchInsightsMetricColumn } from "./search-insights-metric-column";

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
    searchInsightsMetricColumn("clicks", locale, sortable, t),
    searchInsightsMetricColumn("impressions", locale, sortable, t),
    searchInsightsMetricColumn("ctr", locale, sortable, t),
    searchInsightsMetricColumn("position", locale, sortable, t),
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
