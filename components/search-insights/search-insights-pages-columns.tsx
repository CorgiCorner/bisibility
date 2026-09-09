import {
  AVG_POSITION_TIP,
  ENGAGEMENT_RATE_TIP,
  KEY_EVENTS_TIP,
  NO_SESSIONS_MATCH_TITLE,
  ORGANIC_SESSIONS_LABEL,
  SESSIONS_JOIN_TIP,
} from "@/components/search-insights/search-insights-copy";
import {
  formatRowCount,
  formatRowCtr,
  formatRowPosition,
  positionClassName,
} from "@/components/search-insights/search-insights-rows-model";
import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import { pageHref, type SearchInsightsPageRow } from "@/lib/search-insights/queries/top-rows-model";
import { ArrowUpRightIcon as ArrowUpRight } from "@phosphor-icons/react/dist/csr/ArrowUpRight";

export type SearchInsightsPageDataTableRow = SearchInsightsPageRow & { id: string };

type SearchInsightsPageColumnsOptions = {
  keyEventsConfigured: boolean | null;
  showTraffic: boolean;
  sortable: boolean;
};

const NUMBER = "font-sans tabular-nums text-ui-caption";

function PageLink({ url }: Readonly<{ url: string }>) {
  const href = pageHref(url);
  if (!href) return null;
  return (
    <a
      className="inline-grid size-6 place-items-center rounded-control border border-border-control opacity-50 transition-opacity hover:opacity-100 focus-visible:opacity-100 group-hover:opacity-100"
      href={href}
      rel="noopener noreferrer"
      target="_blank"
      title={`Open ${href}`}
    >
      <ArrowUpRight aria-hidden size={12} weight="regular" />
    </a>
  );
}

export function searchInsightsPageColumns({
  keyEventsConfigured,
  showTraffic,
  sortable,
}: SearchInsightsPageColumnsOptions): readonly DataTableColumn<SearchInsightsPageDataTableRow>[] {
  const columns: DataTableColumn<SearchInsightsPageDataTableRow>[] = [
    {
      accessorKey: "path",
      cell: ({ row }) => (
        <span
          className="block truncate font-sans tabular-nums text-ui-caption"
          title={row.original.url}
        >
          {row.original.path}
        </span>
      ),
      header: "Page",
      id: "text",
      meta: { flex: 1, sortField: "text", sortable, title: "Page" },
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
  ];
  if (showTraffic) {
    columns.push(
      {
        accessorKey: "sessions",
        cell: ({ row }) => (
          <span
            className={`${NUMBER} text-fg-muted`}
            title={row.original.sessions === null ? NO_SESSIONS_MATCH_TITLE : undefined}
          >
            {row.original.sessions === null ? "-" : formatRowCount(row.original.sessions)}
          </span>
        ),
        enableSorting: false,
        header: ORGANIC_SESSIONS_LABEL,
        id: "sessions",
        meta: { align: "end", title: SESSIONS_JOIN_TIP },
        minSize: 136,
        size: 136,
      },
      {
        accessorKey: "engagementRate",
        cell: ({ row }) => (
          <span
            className={`${NUMBER} text-fg-muted`}
            title={row.original.engagementRate === null ? ENGAGEMENT_RATE_TIP : undefined}
          >
            {row.original.engagementRate === null ? "-" : formatRowCtr(row.original.engagementRate)}
          </span>
        ),
        enableSorting: false,
        header: "Engagement",
        id: "engagement",
        meta: { align: "end", title: ENGAGEMENT_RATE_TIP },
        minSize: 104,
        size: 104,
      },
    );
    if (keyEventsConfigured === true) {
      columns.push({
        accessorKey: "keyEvents",
        cell: ({ row }) => (
          <span
            className={`${NUMBER} text-fg-muted`}
            title={row.original.keyEvents === null ? KEY_EVENTS_TIP : undefined}
          >
            {row.original.keyEvents === null ? "-" : formatRowCount(row.original.keyEvents)}
          </span>
        ),
        enableSorting: false,
        header: "Key events",
        id: "key-events",
        meta: { align: "end", title: KEY_EVENTS_TIP },
        minSize: 92,
        size: 92,
      });
    } else {
      columns.push(positionColumn(sortable));
    }
  } else {
    columns.push(
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
      positionColumn(sortable),
    );
  }
  columns.push({
    cell: ({ row }) => <PageLink url={row.original.url} />,
    enableSorting: false,
    header: () => <span className="sr-only">Actions</span>,
    id: "actions",
    meta: { align: "end", lockResize: true, title: "Actions" },
    minSize: 96,
    size: 96,
  });
  return columns;
}

function positionColumn(sortable: boolean): DataTableColumn<SearchInsightsPageDataTableRow> {
  return {
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
  };
}
