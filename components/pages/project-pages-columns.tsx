"use client";

import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import { StatusChip, type StatusChipTone } from "@/components/ui/StatusChip";
import type { ResolvedConversionSource } from "@/lib/conversions/selection";
import { disconnectedConversionSource } from "@/lib/conversions/selection";
import { projectPageKeywordHref } from "@/lib/pages/source-links";
import type {
  ProjectPageColumnKind,
  ProjectPageColumnSource,
  ProjectPageRow,
} from "@/lib/pages/types";
import { ArrowUpRightIcon as ArrowUpRight } from "@phosphor-icons/react/dist/csr/ArrowUpRight";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { useMemo } from "react";
import { ProjectPageTagsCell } from "./ProjectPageTagsCell";
import {
  conversionsColumn,
  PageColumnHeading,
  PageMissingValue,
} from "./project-pages-conversions-column";
import { projectPageCwvColumn } from "./project-pages-cwv-column";
import { pageStatusColumn } from "./project-pages-status-column";

export type ProjectPagesTableRow = ProjectPageRow & { id: string };

type ColumnCopy = ReturnType<typeof useTranslations<"projectPages">>;
type Formatter = ReturnType<typeof useFormatter>;

const INDEX_TONE = {
  indexed: "positive",
  inspection_failed: "critical",
  not_checked: "neutral",
  not_indexed: "attention",
} as const satisfies Record<
  "indexed" | "inspection_failed" | "not_checked" | "not_indexed",
  StatusChipTone
>;

function sourceOf(sources: readonly ProjectPageColumnSource[], kind: ProjectPageColumnKind) {
  return sources.find((source) => source.kind === kind);
}

function disconnected(source: ProjectPageColumnSource | undefined) {
  return !source || source.state === "not_connected";
}

function formatPosition(format: Formatter, value: number | null) {
  if (value == null) return null;
  return format.number(value, { maximumFractionDigits: 1, minimumFractionDigits: 1 });
}

export function projectPagesColumns({
  conversion = disconnectedConversionSource,
  format,
  projectId,
  showStatus = false,
  sources,
  t,
}: Readonly<{
  conversion?: ResolvedConversionSource;
  format: Formatter;
  projectId: string;
  showStatus?: boolean;
  sources: readonly ProjectPageColumnSource[];
  t: ColumnCopy;
}>): readonly DataTableColumn<ProjectPagesTableRow>[] {
  const sitemap = sourceOf(sources, "sitemap");
  const indexing = sourceOf(sources, "page_indexing");
  const search = sourceOf(sources, "search_console");
  const analytics = sourceOf(sources, "analytics");
  const rank = sourceOf(sources, "rank_tracker");
  const ai = sourceOf(sources, "ai_visibility");
  const pagespeed = sourceOf(sources, "pagespeed");
  const sessionsHint =
    analytics?.note === "Plausible"
      ? `${t("providers.plausible")}. ${t("plausibleWindow")}`
      : analytics?.note === "GA4"
        ? t("providers.ga4")
        : t("columns.sessions");
  const number = (field: string, label: string, kind: ProjectPageColumnKind, hint?: string) =>
    ({
      header: () => (
        <PageColumnHeading
          disconnected={disconnected(sourceOf(sources, kind))}
          hint={hint}
          kind={kind}
          label={label}
        />
      ),
      id: field,
      meta: { align: "end" as const, sortField: field, sortable: true, title: label },
      minSize: 88,
      size: 96,
    }) satisfies Pick<
      DataTableColumn<ProjectPagesTableRow>,
      "header" | "id" | "meta" | "minSize" | "size"
    >;

  return [
    {
      cell: ({ row }) => (
        <span className="flex min-w-0 items-center gap-1">
          <span className="truncate font-mono text-ui-caption" title={row.original.url}>
            {row.original.path}
          </span>
          <a
            aria-label={t("columns.openUrl", { path: row.original.path })}
            className="inline-grid size-6 shrink-0 place-items-center rounded-control text-fg-muted"
            href={row.original.url}
            rel="noreferrer"
            target="_blank"
          >
            <ArrowUpRight aria-hidden size={12} weight="regular" />
          </a>
        </span>
      ),
      header: t("columns.page"),
      id: "path",
      meta: {
        flex: 1,
        lockVisible: true,
        sortField: "path",
        sortable: true,
        title: t("columns.page"),
      },
      minSize: 180,
      size: 240,
    },
    ...(showStatus ? [pageStatusColumn(t)] : []),
    {
      cell: ({ row }) => <ProjectPageTagsCell tags={row.original.tags} />,
      header: t("columns.tags"),
      id: "tags",
      meta: { sortable: false, title: t("columns.tags") },
      minSize: 140,
      size: 180,
    },
    {
      cell: ({ row }) =>
        disconnected(sitemap) ? (
          <PageMissingValue source={t("sourceKind.sitemap")} />
        ) : (
          <StatusChip
            label={
              row.original.sitemap.listed ? t("sitemapState.listed") : t("sitemapState.notListed")
            }
            size="sm"
            tone={row.original.sitemap.listed ? "positive" : "neutral"}
          />
        ),
      header: () => (
        <PageColumnHeading
          disconnected={disconnected(sitemap)}
          kind="sitemap"
          label={t("columns.sitemap")}
        />
      ),
      id: "sitemap",
      meta: { sortable: false, title: t("columns.sitemap") },
      minSize: 120,
      size: 128,
    },
    {
      cell: ({ row }) => {
        if (disconnected(indexing))
          return <PageMissingValue source={t("sourceKind.page_indexing")} />;
        const group = row.original.index?.group ?? "not_checked";
        return <StatusChip label={t(`indexGroup.${group}`)} size="sm" tone={INDEX_TONE[group]} />;
      },
      header: () => (
        <PageColumnHeading
          disconnected={disconnected(indexing)}
          kind="page_indexing"
          label={t("columns.index")}
        />
      ),
      id: "index",
      meta: { sortable: false, title: t("columns.index") },
      minSize: 140,
      size: 156,
    },
    projectPageCwvColumn({ disconnected: disconnected(pagespeed), t }),
    {
      ...number("clicks", t("columns.clicks"), "search_console", t("sourceKind.search_console")),
      cell: ({ row }) =>
        disconnected(search) || !row.original.searchConsole ? (
          <PageMissingValue source={t("sourceKind.search_console")} />
        ) : (
          format.number(row.original.searchConsole.clicks)
        ),
    },
    {
      ...number(
        "impressions",
        t("columns.impressions"),
        "search_console",
        t("sourceKind.search_console"),
      ),
      cell: ({ row }) =>
        disconnected(search) || !row.original.searchConsole ? (
          <PageMissingValue source={t("sourceKind.search_console")} />
        ) : (
          format.number(row.original.searchConsole.impressions)
        ),
    },
    {
      ...number(
        "position",
        t("columns.position"),
        "search_console",
        t("sourceKind.search_console"),
      ),
      cell: ({ row }) => {
        const value = formatPosition(format, row.original.searchConsole?.position ?? null);
        return disconnected(search) || value == null ? (
          <PageMissingValue source={t("sourceKind.search_console")} />
        ) : (
          value
        );
      },
    },
    {
      ...number("sessions", t("columns.sessions"), "analytics", sessionsHint),
      cell: ({ row }) =>
        disconnected(analytics) || !row.original.sessions ? (
          <PageMissingValue
            source={
              analytics?.note === "Plausible" ? t("providers.plausible") : t("sourceKind.analytics")
            }
          />
        ) : (
          format.number(row.original.sessions.value)
        ),
    },
    conversionsColumn({ conversion, format, t }),
    {
      ...number("keywords", t("columns.keywords"), "rank_tracker", t("sourceKind.rank_tracker")),
      cell: ({ row }) =>
        disconnected(rank) ? (
          <PageMissingValue source={t("sourceKind.rank_tracker")} />
        ) : (
          <Link
            aria-label={t("keywordsLink", { path: row.original.path })}
            href={projectPageKeywordHref(projectId, row.original.url)}
          >
            {format.number(row.original.keywords)}
          </Link>
        ),
    },
    {
      ...number(
        "aiCitations",
        t("columns.aiCitations"),
        "ai_visibility",
        t("sourceKind.ai_visibility"),
      ),
      cell: ({ row }) =>
        disconnected(ai) ? (
          <PageMissingValue source={t("sourceKind.ai_visibility")} />
        ) : (
          format.number(row.original.aiCitations)
        ),
    },
  ];
}

export function useProjectPagesColumns(
  projectId: string,
  sources: readonly ProjectPageColumnSource[],
  showStatus = false,
  conversion: ResolvedConversionSource = disconnectedConversionSource,
) {
  const t = useTranslations("projectPages");
  const format = useFormatter();
  return useMemo(
    () => projectPagesColumns({ conversion, format, projectId, showStatus, sources, t }),
    [conversion, format, projectId, showStatus, sources, t],
  );
}
