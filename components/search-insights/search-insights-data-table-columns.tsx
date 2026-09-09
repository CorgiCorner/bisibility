import {
  AVG_POSITION_TIP,
  TRACK_DIALOG_COPY,
  TRACK_LABEL,
  TRACK_TITLE,
  TRACKED_LABEL,
  TRACKED_TITLE,
} from "@/components/search-insights/search-insights-copy";
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

export type SearchInsightsQueryDataTableRow = SearchInsightsQueryRow & { id: string };

type SearchInsightsQueryColumnsOptions = {
  adding: ReadonlySet<string>;
  onTrack?: (row: SearchInsightsQueryRow) => void;
  sortable: boolean;
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
  tracked,
}: Readonly<{
  adding: ReadonlySet<string>;
  onTrack?: (row: SearchInsightsQueryRow) => void;
  row: SearchInsightsQueryDataTableRow;
  tracked: ReadonlySet<string>;
}>) {
  const isTracked = tracked.has(trackedKey(row.query));
  if (isTracked || adding.has(row.query)) {
    return (
      <span
        className="inline-flex items-center font-sans tabular-nums text-ui-micro text-fg-muted"
        title={isTracked ? TRACKED_TITLE : undefined}
      >
        {isTracked ? TRACKED_LABEL : TRACK_DIALOG_COPY.adding}
      </span>
    );
  }
  return (
    <>
      <Button
        className={QUICK_ACTION}
        onClick={() => onTrack?.(row)}
        size="xs"
        title={TRACK_TITLE}
        variant="secondary"
      >
        {TRACK_LABEL}
      </Button>
      <CaretRight aria-hidden className={COARSE_CARET} size={12} weight="regular" />
    </>
  );
}

export function searchInsightsQueryColumns({
  adding,
  onTrack,
  sortable,
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
      header: "Query",
      id: "text",
      meta: { flex: 1, sortField: "text", sortable, title: "Query" },
      minSize: 160,
      size: 200,
    },
    {
      accessorKey: "clicks",
      cell: ({ row }) => (
        <span className={`${NUMBER} font-semibold`}>{formatRowCount(row.original.clicks)}</span>
      ),
      header: "Clicks",
      id: "clicks",
      meta: { align: "end", sortField: "clicks", sortable, title: "Clicks" },
      minSize: 80,
      size: 80,
      sortDescFirst: true,
    },
    {
      accessorKey: "impressions",
      cell: ({ row }) => (
        <span className={`${NUMBER} text-fg-muted`}>
          {formatRowCount(row.original.impressions)}
        </span>
      ),
      header: "Impr",
      id: "impressions",
      meta: { align: "end", sortField: "impressions", sortable, title: "Impressions" },
      minSize: 72,
      size: 72,
      sortDescFirst: true,
    },
    {
      accessorKey: "ctr",
      cell: ({ row }) => (
        <span className={`${NUMBER} text-fg-muted`}>{formatRowCtr(row.original.ctr)}</span>
      ),
      header: "CTR",
      id: "ctr",
      meta: { align: "end", sortField: "ctr", sortable, title: "CTR" },
      minSize: 64,
      size: 64,
      sortDescFirst: true,
    },
    {
      accessorKey: "position",
      cell: ({ row }) => (
        <span className={`${NUMBER} ${positionClassName(row.original.position)}`}>
          {formatRowPosition(row.original.position)}
        </span>
      ),
      header: "Avg pos",
      id: "position",
      meta: { align: "end", sortField: "position", sortable, title: AVG_POSITION_TIP },
      minSize: 88,
      size: 88,
    },
    {
      cell: ({ row }) => (
        <QueryActions adding={adding} onTrack={onTrack} row={row.original} tracked={tracked} />
      ),
      enableSorting: false,
      header: () => <span className="sr-only">Actions</span>,
      id: "actions",
      meta: { align: "end", lockResize: true, title: "Actions" },
      minSize: 96,
      size: 96,
    },
  ];
}
