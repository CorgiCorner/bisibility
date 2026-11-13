"use client";

import { SearchInsightsPeriodMenu } from "@/components/search-insights/SearchInsightsPeriodMenu";
import { Button } from "@/components/ui/Button";
import { DataTableColumnsMenu } from "@/components/ui/data-table/DataTableColumnsMenu";
import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { Pill } from "@/components/ui/Pill";
import { ToolbarSearch } from "@/components/ui/ToolbarSearch";
import { projectPagesPeriod, projectPagesPeriodId } from "@/lib/pages/period";
import type { ProjectPageTagOption } from "@/lib/pages/tag-view";
import type { ProjectPagesListResult } from "@/lib/pages/types";
import type { ProjectPagesQuery } from "@/lib/pages/url-state";
import { useFormatter, useTranslations } from "next-intl";
import type { ProjectPagesTableRow } from "./project-pages-columns";

const ALL_TAGS = "all";

export function ProjectPagesToolbar({
  canWrite,
  columns,
  counts,
  onFilters,
  onNewTag,
  onQuery,
  onSearchChange,
  pending,
  query,
  search,
  showStatus,
  tags,
}: Readonly<{
  canWrite: boolean;
  columns: readonly DataTableColumn<ProjectPagesTableRow>[];
  counts: ProjectPagesListResult["counts"];
  onFilters: () => void;
  onNewTag: () => void;
  onQuery: (query: ProjectPagesQuery) => void;
  onSearchChange: (value: string) => void;
  pending: boolean;
  query: ProjectPagesQuery;
  search: string;
  showStatus: boolean;
  tags: readonly ProjectPageTagOption[];
}>) {
  const t = useTranslations("projectPages");
  const format = useFormatter();
  const period = projectPagesPeriod(query.period);
  function commitSearch() {
    const next = search.trim();
    if (next === query.search) return;
    onQuery({ ...query, page: 1, search: next });
  }
  function sitemap(value: ProjectPagesQuery["sitemap"]) {
    onQuery({ ...query, page: 1, sitemap: value });
  }
  function status(value: ProjectPagesQuery["status"]) {
    onQuery({ ...query, page: 1, status: value });
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ToolbarSearch
        className="w-full sm:max-w-xs"
        id="project-pages-search"
        label={t("search.label")}
        onBlur={commitSearch}
        onChange={onSearchChange}
        onSubmit={commitSearch}
        placeholder={t("search.placeholder")}
        value={search}
      />
      <SearchInsightsPeriodMenu
        onPeriodChange={(id) => onQuery({ ...query, page: 1, period: projectPagesPeriodId(id) })}
        pending={pending}
        period={period.period}
        window={period.window}
      />
      <DataTableColumnsMenu columns={columns} id="project-pages" />
      <MenuSelect
        ariaLabel={t("tags.all")}
        onChange={(value) =>
          onQuery({ ...query, page: 1, tag: value === ALL_TAGS ? undefined : value })
        }
        options={[
          { label: t("tags.all"), value: ALL_TAGS },
          ...tags.map((tag) => ({ label: tag.name, value: tag.id })),
        ]}
        value={query.tag ?? ALL_TAGS}
      />
      <Button disabled={!canWrite} onClick={onNewTag} size="sm" type="button" variant="outline">
        {t("tags.new")}
      </Button>
      <Button onClick={onFilters} size="sm" type="button" variant="outline">
        {t("filters.label")}
      </Button>
      {query.coverage ? (
        <Pill
          aria-label={t("filters.clearCoverage", { reason: query.coverage })}
          onClick={() => onQuery({ ...query, coverage: undefined, page: 1 })}
          type="button"
        >
          {query.coverage}
        </Pill>
      ) : null}
      <div className="flex flex-wrap gap-1">
        {showStatus ? (
          <>
            <Pill active={!query.status} onClick={() => status(undefined)} type="button">
              {t("segments.all")} {format.number(counts.all)}
            </Pill>
            <Pill
              active={query.status === "in_snapshot"}
              onClick={() => status("in_snapshot")}
              type="button"
            >
              {t("segments.inSnapshot")} {format.number(counts.inSnapshot)}
            </Pill>
            <Pill active={query.status === "new"} onClick={() => status("new")} type="button">
              {t("segments.new")} {format.number(counts.new)}
            </Pill>
            <Pill
              active={query.status === "removed"}
              onClick={() => status("removed")}
              type="button"
            >
              {t("segments.removed")} {format.number(counts.removed)}
            </Pill>
          </>
        ) : (
          <>
            <Pill active={!query.sitemap} onClick={() => sitemap(undefined)} type="button">
              {t("segments.all")} {format.number(counts.all)}
            </Pill>
            <Pill
              active={query.sitemap === "listed"}
              onClick={() => sitemap("listed")}
              type="button"
            >
              {t("segments.listed")} {format.number(counts.listed)}
            </Pill>
            <Pill
              active={query.sitemap === "not_listed"}
              onClick={() => sitemap("not_listed")}
              type="button"
            >
              {t("segments.notListed")} {format.number(counts.notListed)}
            </Pill>
          </>
        )}
      </div>
    </div>
  );
}
