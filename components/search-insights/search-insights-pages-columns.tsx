import {
  formatRowCount,
  formatRowCtr,
  formatRowPosition,
  positionClassName,
} from "@/components/search-insights/search-insights-rows-model";
import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import { pageHref, type SearchInsightsPageRow } from "@/lib/search-insights/queries/top-rows-model";
import { ArrowUpRightIcon as ArrowUpRight } from "@phosphor-icons/react/dist/csr/ArrowUpRight";
import type { useTranslations } from "next-intl";

export type SearchInsightsPageDataTableRow = SearchInsightsPageRow & { id: string };

type SearchInsightsPageColumnsOptions = {
  keyEventsConfigured: boolean | null;
  locale: string;
  showTraffic: boolean;
  sortable: boolean;
  t: ReturnType<typeof useTranslations<"projectSearchInsights.copy">>;
};

const NUMBER = "font-sans tabular-nums text-ui-caption";

function PageLink({
  t,
  url,
}: Readonly<{
  t: ReturnType<typeof useTranslations<"projectSearchInsights.copy">>;
  url: string;
}>) {
  const href = pageHref(url);
  if (!href) return null;
  return (
    <a
      className="inline-grid size-6 place-items-center rounded-control border border-border-control opacity-50 transition-opacity hover:opacity-100 focus-visible:opacity-100 group-hover:opacity-100"
      href={href}
      rel="noopener noreferrer"
      target="_blank"
      title={t("openUrl", { url: href })}
    >
      <ArrowUpRight aria-hidden size={12} weight="regular" />
    </a>
  );
}

export function searchInsightsPageColumns({
  keyEventsConfigured,
  locale,
  showTraffic,
  sortable,
  t,
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
      header: t("page"),
      id: "text",
      meta: { flex: 1, sortField: "text", sortable, title: t("page") },
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
  ];
  if (showTraffic) {
    columns.push(
      {
        accessorKey: "sessions",
        cell: ({ row }) => (
          <span
            className={`${NUMBER} text-fg-muted`}
            title={row.original.sessions === null ? t("noSessionsMatch") : undefined}
          >
            {row.original.sessions === null ? "-" : formatRowCount(row.original.sessions, locale)}
          </span>
        ),
        enableSorting: false,
        header: t("organicSessions"),
        id: "sessions",
        meta: { align: "end", title: t("sessionsJoinTip") },
        minSize: 136,
        size: 136,
      },
      {
        accessorKey: "engagementRate",
        cell: ({ row }) => (
          <span
            className={`${NUMBER} text-fg-muted`}
            title={row.original.engagementRate === null ? t("engagementRateTip") : undefined}
          >
            {row.original.engagementRate === null
              ? "-"
              : formatRowCtr(row.original.engagementRate, locale)}
          </span>
        ),
        enableSorting: false,
        header: t("engagement"),
        id: "engagement",
        meta: { align: "end", title: t("engagementRateTip") },
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
            title={row.original.keyEvents === null ? t("keyEventsTip") : undefined}
          >
            {row.original.keyEvents === null ? "-" : formatRowCount(row.original.keyEvents, locale)}
          </span>
        ),
        enableSorting: false,
        header: t("keyEvents"),
        id: "key-events",
        meta: { align: "end", title: t("keyEventsTip") },
        minSize: 92,
        size: 92,
      });
    } else {
      columns.push(positionColumn(locale, sortable, t));
    }
  } else {
    columns.push(
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
          <span className={`${NUMBER} text-fg-muted`}>
            {formatRowCtr(row.original.ctr, locale)}
          </span>
        ),
        header: t("ctr"),
        id: "ctr",
        meta: { align: "end", sortField: "ctr", sortable, title: t("ctr") },
        minSize: 64,
        size: 64,
        sortDescFirst: true,
      },
      positionColumn(locale, sortable, t),
    );
  }
  columns.push({
    cell: ({ row }) => <PageLink t={t} url={row.original.url} />,
    enableSorting: false,
    header: () => <span className="sr-only">{t("actions")}</span>,
    id: "actions",
    meta: { align: "end", lockResize: true, title: t("actions") },
    minSize: 96,
    size: 96,
  });
  return columns;
}

function positionColumn(
  locale: string,
  sortable: boolean,
  t: ReturnType<typeof useTranslations<"projectSearchInsights.copy">>,
): DataTableColumn<SearchInsightsPageDataTableRow> {
  return {
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
  };
}
