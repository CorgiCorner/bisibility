"use client";

import { Button } from "@/components/ui/Button";
import { DataTable } from "@/components/ui/data-table/DataTable";
import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import type { OverviewEngineRow } from "@/lib/ai-tracking/overview-model";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";
import { aiVisibilityTableLayouts } from "./ai-visibility-column-layout";
import {
  overviewEngineCopy,
  overviewEngineLabel,
  overviewList,
  overviewProviderLabel,
} from "./overview-labels";

export function AiVisibilityOverviewEngines({
  manageHref,
  rows,
}: Readonly<{ manageHref: string | null; rows: readonly OverviewEngineRow[] }>) {
  const t = useTranslations("projectAiTracking");
  const locale = useLocale();
  const labels = overviewEngineCopy((key) => t(key));
  const columns = useMemo(() => engineColumns(labels, locale, t), [labels, locale, t]);
  if (!rows.length) return null;
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="m-0 font-sans text-ui-section">{t("overview.enginesTitle")}</h2>
        {manageHref ? (
          <Button component={Link} href={manageHref} size="sm" variant="ghost">
            {t("overview.manageEngines")}
          </Button>
        ) : null}
      </div>
      <DataTable
        ariaLabel={t("overview.enginesTitle")}
        columns={columns}
        density="compact"
        id="ai-visibility-engines"
        onSortingChange={() => undefined}
        rows={rows.map((row) => ({ ...row, id: row.engine }))}
        sorting={null}
      />
    </section>
  );
}

const engineLayout = aiVisibilityTableLayouts.engines;

function engineColumns(
  labels: ReturnType<typeof overviewEngineCopy>,
  locale: string,
  t: ReturnType<typeof useTranslations<"projectAiTracking">>,
): DataTableColumn<OverviewEngineRow & { id: string }>[] {
  return [
    {
      cell: ({ row }) => overviewEngineLabel(row.original.engine, labels),
      header: t("engine"),
      id: "engine",
      meta: { sortable: false },
      size: engineLayout.engine.size,
    },
    {
      cell: ({ row }) =>
        row.original.quiet
          ? t("overview.engineNoAnswers")
          : t("overview.countOf", { count: row.original.named, total: row.original.answers }),
      header: t("overview.named"),
      id: "named",
      meta: { sortable: false },
      size: engineLayout.named.size,
    },
    {
      cell: ({ row }) =>
        row.original.quiet
          ? t("overview.unknownCount")
          : t("overview.countOf", { count: row.original.cited, total: row.original.answers }),
      header: t("overview.cited"),
      id: "cited",
      meta: { sortable: false },
      size: engineLayout.cited.size,
    },
    {
      cell: ({ row }) =>
        row.original.quiet
          ? t("overview.unknownCount")
          : row.original.providers.length
            ? overviewList(locale, row.original.providers.map(overviewProviderLabel))
            : t("overview.unknownProvider"),
      header: t("overview.columnProvider"),
      id: "provider",
      meta: { flex: engineLayout.provider.flex, sortable: false },
      minSize: engineLayout.provider.minSize,
      size: engineLayout.provider.size,
    },
  ];
}
