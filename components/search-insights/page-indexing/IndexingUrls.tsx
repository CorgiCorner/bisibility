"use client";

import { SearchInsightsRowsCard } from "@/components/search-insights/SearchInsightsRowsCard";
import { Button } from "@/components/ui/Button";
import { dataLinkClassName } from "@/components/ui/data-link-styles";
import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import { InlineCallout } from "@/components/ui/InlineCallout";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { StatusChip } from "@/components/ui/StatusChip";
import { ToolbarSearch } from "@/components/ui/ToolbarSearch";
import type { IndexingData, IndexingGroup, IndexingUrl } from "@/lib/search-index/ui-model";
import { latestTrackedChange } from "@/lib/search-index/url-change";
import { useFormatter, useTranslations } from "next-intl";
import { IndexingPath, IndexingTable } from "./IndexingTable";
import type { IndexingUrlList } from "./use-indexing-urls";
import { useViewerTimeZone } from "./use-viewer-time-zone";

export function IndexingUrls({
  data,
  list,
  onOpen,
}: Readonly<{
  data: IndexingData;
  list: IndexingUrlList;
  onOpen: (row: IndexingUrl, trigger: HTMLElement) => void;
}>) {
  const t = useTranslations("projectSearchInsights.indexing");
  const format = useFormatter();
  const timeZone = useViewerTimeZone();
  const date = (value: Date) =>
    format.dateTime(new Date(value), { timeZone, month: "short", day: "numeric" });
  const since = new Date(new Date(data.now ?? new Date()).getTime() - 7 * 86400000).toISOString();
  const { rows, filters, error, pending, change } = list;
  const reason = filters.group
    ? filters.coverage_state
      ? `${filters.group}:${filters.coverage_state}`
      : filters.group
    : "";
  const columns: DataTableColumn<IndexingUrl & { id: string }>[] = [
    {
      id: "url",
      accessorFn: (row) => row.url,
      header: t("url"),
      size: 140,
      minSize: 140,
      meta: { flex: 1, lockResize: true },
      enableSorting: true,
      cell: ({ row }) => (
        <Button
          id={`indexing-url-${encodeURIComponent(row.original.url)}`}
          size="sm"
          variant="ghost"
          type="button"
          className={`${dataLinkClassName} block w-full min-w-0 min-h-0 p-0 text-left text-ui-body font-normal hover:bg-transparent`}
          onClick={(event) => onOpen(row.original, event.currentTarget)}
        >
          <IndexingPath value={row.original.url} />
        </Button>
      ),
    },
    {
      id: "state",
      accessorFn: (row) => row.coverageState ?? row.group,
      header: t("coverageState"),
      size: 200,
      minSize: 200,
      maxSize: 200,
      meta: { lockResize: true },
      enableSorting: true,
      cell: ({ row }) => (
        <div className="whitespace-normal break-words">
          {row.original.group === "inspection_failed" || row.original.group === "not_checked"
            ? t(`groups.${row.original.group as IndexingGroup}`)
            : (row.original.coverageState ?? t(`groups.${row.original.group as IndexingGroup}`))}
          {row.original.googleCanonical && row.original.googleCanonical !== row.original.url ? (
            <div className="text-ui-caption text-fg-muted">
              {t("googleChose")}
              <IndexingPath value={row.original.googleCanonical} />
            </div>
          ) : null}
        </div>
      ),
    },
    {
      id: "crawl",
      accessorFn: (row) => row.lastCrawlAt,
      sortDescFirst: true,
      header: t("lastCrawl"),
      size: 112,
      enableSorting: true,
      cell: ({ row }) => (row.original.lastCrawlAt ? date(row.original.lastCrawlAt) : "-"),
    },
    {
      id: "change",
      accessorFn: (row) => latestTrackedChange(row.history?.changes ?? [])?.at,
      sortDescFirst: true,
      header: t("change"),
      size: 168,
      enableSorting: true,
      cell: ({ row }) => {
        const change = latestTrackedChange(row.original.history?.changes ?? []);
        return change ? (
          <StatusChip
            size="sm"
            variant="outline"
            tone={change.kind === "indexed" ? "positive" : "attention"}
            label={t(`changeKinds.${change.kind}`, { date: date(change.at) })}
          />
        ) : (
          "-"
        );
      },
    },
  ];
  return (
    <SearchInsightsRowsCard
      title={t("urls")}
      caption={t("urlsCaption")}
      empty={!data.report.total && !data.urls.length}
      emptyReason={t("nothingInspected")}
      expandable={false}
      toolbar={
        <>
          <MenuSelect
            ariaLabel={t("coverageState")}
            value={reason}
            onChange={(value) => {
              const separator = value.indexOf(":");
              change({
                group:
                  separator < 0
                    ? ((value || undefined) as IndexingGroup | undefined)
                    : (value.slice(0, separator) as IndexingGroup),
                coverage_state: separator < 0 ? undefined : value.slice(separator + 1),
              });
            }}
            options={[
              { value: "", label: t("allStates") },
              ...(["indexed", "not_indexed", "inspection_failed", "not_checked"] as const).map(
                (group) => ({ value: group, label: t(`groups.${group}`) }),
              ),
              ...data.report.groups.flatMap((group) =>
                group.reasons.flatMap((item) =>
                  item.coverageState
                    ? [
                        {
                          value: `${group.group}:${item.coverageState}`,
                          label:
                            item.coverageState === "Unspecified"
                              ? t("unspecifiedReason")
                              : item.coverageState,
                        },
                      ]
                    : [],
                ),
              ),
            ]}
          />
          <MenuSelect
            ariaLabel={t("sitemap")}
            value={filters.sitemap ?? ""}
            onChange={(value) => change({ sitemap: value || undefined })}
            options={[
              { value: "", label: t("allSitemaps") },
              ...data.sitemaps.map((item) => ({ value: item.id, label: item.id })),
            ]}
          />
          <MenuSelect
            ariaLabel={t("change")}
            value={filters.changed_since ? "7" : ""}
            onChange={(value) => change({ changed_since: value ? since : undefined })}
            options={[
              { value: "", label: t("allChanges") },
              { value: "7", label: t("changedLast7Days") },
            ]}
          />
          <ToolbarSearch
            id="indexing-search"
            label={t("search")}
            placeholder={t("search")}
            value={filters.search ?? ""}
            onChange={(value) => change({ search: value || undefined }, true)}
            onSubmit={list.submitSearch}
          />
        </>
      }
    >
      <div ref={list.attach} aria-busy={pending}>
        {error ? (
          <InlineCallout tint="yellow" role="alert">
            {t("loadFailed")}
          </InlineCallout>
        ) : null}
        <IndexingTable
          id="indexing-urls"
          label={t("urls")}
          columns={columns}
          emptyState={<p className="m-0 text-ui-caption text-fg-muted">{t("noMatches")}</p>}
          rows={rows.map((row) => ({ ...row, id: row.url }))}
          pagination={list.pagination}
          sorting={list.sorting}
          onPageChange={list.changePage}
          onSortChange={list.changeSort}
          pending={pending}
        />
      </div>
    </SearchInsightsRowsCard>
  );
}
