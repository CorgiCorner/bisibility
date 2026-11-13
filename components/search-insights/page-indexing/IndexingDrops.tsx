"use client";

import { SearchInsightsRowsCard } from "@/components/search-insights/SearchInsightsRowsCard";
import { dataLinkClassName } from "@/components/ui/data-link-styles";
import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import { defaultProjectPagesQuery, projectPagesHref } from "@/lib/pages/url-state";
import { appPath } from "@/lib/routing/app-path";
import { indexingPagePath } from "@/lib/search-index/deindex-model";
import type { IndexingData, IndexingDrop } from "@/lib/search-index/ui-model";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { useMemo } from "react";
import { IndexingTable } from "./IndexingTable";
import { indexingOverviewOf } from "./indexing-view-model";
import { useViewerTimeZone } from "./use-viewer-time-zone";

type DropTableRow = IndexingDrop & { id: string; path: string };

export function IndexingDrops({
  data,
  projectId,
}: Readonly<{ data: IndexingData; projectId: string }>) {
  const t = useTranslations("projectSearchInsights.indexing");
  const format = useFormatter();
  const timeZone = useViewerTimeZone();
  const drops = indexingOverviewOf(data).drops;
  const rows = useMemo<DropTableRow[]>(
    () =>
      drops.map((drop) => ({
        ...drop,
        id: `${drop.url}:${drop.at}`,
        path: indexingPagePath(drop.url),
      })),
    [drops],
  );
  const columns = useMemo<DataTableColumn<DropTableRow>[]>(
    () => [
      {
        cell: ({ row }) => row.original.path,
        enableSorting: false,
        header: t("drops.page"),
        id: "page",
        meta: { flex: 1 },
        size: 180,
      },
      {
        cell: ({ row }) =>
          format.dateTime(new Date(row.original.at), { day: "numeric", month: "short", timeZone }),
        enableSorting: false,
        header: t("drops.since"),
        id: "since",
        size: 96,
      },
      {
        cell: ({ row }) => row.original.reason ?? t("drops.reasonMissing"),
        enableSorting: false,
        header: t("drops.reason"),
        id: "reason",
        meta: { flex: 1 },
        size: 180,
      },
      {
        cell: ({ row }) =>
          row.original.annotationId ? (
            <Link
              className={dataLinkClassName}
              href={`${appPath(projectId, "annotations")}?q=${encodeURIComponent(row.original.annotationId)}`}
            >
              {t("drops.inAnnotations")}
            </Link>
          ) : (
            t("drops.notInAnnotations")
          ),
        enableSorting: false,
        header: t("drops.annotations"),
        id: "annotations",
        size: 140,
      },
    ],
    [format, projectId, t, timeZone],
  );
  if (rows.length === 0) return null;
  return (
    <SearchInsightsRowsCard
      caption={t("drops.caption")}
      empty={false}
      expandable={false}
      headerEnd={
        <Link
          className={`${dataLinkClassName} text-ui-caption`}
          href={projectPagesHref(projectId, { ...defaultProjectPagesQuery, index: "not_indexed" })}
        >
          {t("drops.viewInPages")}
        </Link>
      }
      title={t("drops.title")}
    >
      <IndexingTable columns={columns} id="indexing-drops" label={t("drops.title")} rows={rows} />
    </SearchInsightsRowsCard>
  );
}
