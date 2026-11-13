"use client";

import { SearchInsightsRowsCard } from "@/components/search-insights/SearchInsightsRowsCard";
import { Button } from "@/components/ui/Button";
import { Disclosure } from "@/components/ui/Disclosure";
import { dataLinkClassName } from "@/components/ui/data-link-styles";
import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import { useToast } from "@/components/ui/toast-context";
import { defaultProjectPagesQuery, projectPagesHref } from "@/lib/pages/url-state";
import { coverageExplanation, genericCoverageDocs } from "@/lib/search-index/coverage-catalog";
import type { ReasonCountRow } from "@/lib/search-index/reason-change";
import type { ExportNotIndexedAction, IndexingData } from "@/lib/search-index/ui-model";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { downloadTextFile } from "@/lib/ui/download";
import { DownloadSimpleIcon as DownloadSimple } from "@phosphor-icons/react/dist/csr/DownloadSimple";
import { useFormatter, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { IndexingTable } from "./IndexingTable";
import { indexingOverviewOf } from "./indexing-view-model";
import { useViewerTimeZone } from "./use-viewer-time-zone";

function changeLabel(
  change: ReasonCountRow["change"],
  asOf: string,
  t: ReturnType<typeof useTranslations<"projectSearchInsights.indexing">>,
  format: ReturnType<typeof useFormatter>,
  timeZone: string,
) {
  if (!change) return null;
  const date = format.dateTime(new Date(asOf), { day: "numeric", month: "short", timeZone });
  if (change.kind === "new") return t("reasons.changeNew");
  if (change.kind === "unchanged") return t("reasons.changeNone");
  if (change.kind === "increased") return t("reasons.changeUp", { count: change.delta, date });
  return t("reasons.changeDown", { count: Math.abs(change.delta), date });
}

export function IndexingReasonList({
  data,
  exportAction,
  projectId,
}: Readonly<{
  data: IndexingData;
  exportAction?: ExportNotIndexedAction;
  projectId: string;
}>) {
  const t = useTranslations("projectSearchInsights.indexing");
  const format = useFormatter();
  const timeZone = useViewerTimeZone();
  const { showToast } = useToast();
  const [exporting, setExporting] = useState(false);
  const overview = indexingOverviewOf(data);
  const rows = overview.reasons.rows;
  const derived = overview.reasons.derived;
  const tableRows = useMemo(() => rows.map((row) => ({ ...row, id: row.coverageState })), [rows]);
  const columns = useMemo<DataTableColumn<(typeof tableRows)[number]>[]>(
    () => [
      {
        cell: ({ row }) => {
          const guide = coverageExplanation(row.original.coverageState);
          return (
            <Disclosure title={row.original.coverageState} variant="inline">
              {guide ? (
                <div className="flex flex-col gap-2 pb-2 text-ui-caption text-fg">
                  <p className="m-0">{t(`explanations.${guide.id}.meaning`)}</p>
                  <ol className="m-0 list-decimal pl-5">
                    <li>{t(`explanations.${guide.id}.step1`)}</li>
                    <li>{t(`explanations.${guide.id}.step2`)}</li>
                    <li>{t(`explanations.${guide.id}.step3`)}</li>
                  </ol>
                  <a
                    className={dataLinkClassName}
                    href={guide.href}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    {t("reasons.docs")}
                  </a>
                </div>
              ) : (
                <p className="m-0 pb-2 text-ui-caption">
                  <a
                    className={dataLinkClassName}
                    href={genericCoverageDocs}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    {t("reasons.genericDocs")}
                  </a>
                </p>
              )}
            </Disclosure>
          );
        },
        header: t("reasons.columnReason"),
        id: "reason",
        meta: { flex: 1, title: t("reasons.columnReason") },
        size: 220,
      },
      {
        cell: ({ row }) => format.number(row.original.count),
        header: t("reasons.columnUrls"),
        id: "urls",
        size: 96,
      },
      {
        cell: ({ row }) =>
          derived
            ? changeLabel(row.original.change, overview.reasons.asOf, t, format, timeZone)
            : null,
        header: t("reasons.columnChange"),
        id: "change",
        size: 160,
      },
      {
        cell: ({ row }) => (
          <Button
            href={projectPagesHref(projectId, {
              ...defaultProjectPagesQuery,
              coverage: row.original.coverageState,
              index: "not_indexed",
            })}
            size="sm"
            variant="secondary"
          >
            {t("reasons.openInPages")}
          </Button>
        ),
        header: t("reasons.openInPages"),
        id: "open",
        meta: { title: t("reasons.openInPages") },
        size: 140,
      },
    ],
    [derived, format, overview.reasons.asOf, projectId, t, timeZone],
  );
  async function exportCsv() {
    if (!exportAction) return;
    setExporting(true);
    try {
      const result = await exportAction({ projectId });
      downloadTextFile(result.csv, result.filename, "text/csv;charset=utf-8");
      if (result.truncated) {
        showToast(t("reasons.exportTruncated", { rows: result.rows }), { severity: "warning" });
      }
    } catch (error) {
      showToast(actionErrorMessage(error, t("reasons.exportFailed")), { severity: "error" });
    } finally {
      setExporting(false);
    }
  }
  return (
    <SearchInsightsRowsCard
      caption={
        derived ? t("reasons.caption") : `${t("reasons.caption")} ${t("reasons.changeUnavailable")}`
      }
      empty={rows.length === 0}
      emptyReason={t("reasons.empty")}
      expandable={false}
      headerEnd={
        exportAction ? (
          <Button
            disabled={rows.length === 0}
            loading={exporting}
            onClick={() => void exportCsv()}
            size="sm"
            startIcon={<DownloadSimple size={14} weight="regular" />}
            variant="secondary"
          >
            {t("reasons.export")}
          </Button>
        ) : null
      }
      title={t("reasons.title")}
    >
      <IndexingTable
        columns={columns}
        id="indexing-reasons"
        label={t("reasons.title")}
        rows={tableRows}
      />
    </SearchInsightsRowsCard>
  );
}
