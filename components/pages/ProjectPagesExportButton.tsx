"use client";
import { Button } from "@/components/ui/Button";
import { useDataTableLayout } from "@/components/ui/data-table/data-table-layout-store";
import { dataTableColumnId } from "@/components/ui/data-table/data-table-model";
import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import { Tooltip } from "@/components/ui/Tooltip";
import { useToast } from "@/components/ui/toast-context";
import { type ProjectPagesExportAction, projectPagesExportColumns } from "@/lib/pages/export-csv";
import { downloadTextFile } from "@/lib/ui/download";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { ProjectPagesTableRow } from "./project-pages-columns";

export function ProjectPagesExportButton({
  columns,
  exportCsv,
  total,
}: Readonly<{
  columns: readonly DataTableColumn<ProjectPagesTableRow>[];
  exportCsv: ProjectPagesExportAction;
  total: number;
}>) {
  const t = useTranslations("projectPages");
  const { showToast } = useToast();
  const [pending, setPending] = useState(false);
  const layout = useDataTableLayout("project-pages");
  async function download() {
    if (pending || !total) return;
    setPending(true);
    try {
      const visible = columns.flatMap((column) => {
        const id = dataTableColumnId(column);
        return projectPagesExportColumns.filter(
          (key) =>
            key === id && (column.meta?.lockVisible || layout.columnVisibility[key] !== false),
        );
      });
      const result = await exportCsv(visible);
      if (result.status === "too_large")
        showToast(t("export.tooLarge", { count: result.limit }), { severity: "warning" });
      else if (result.status === "sitemap_not_checked" || result.status === "sitemap_incomplete")
        showToast(
          t(
            result.status === "sitemap_not_checked"
              ? "sitemapState.notCheckedHint"
              : "sitemapState.freshnessHint",
          ),
          { severity: "warning" },
        );
      else if (result.status === "ok")
        downloadTextFile(`\uFEFF${result.csv}`, result.filename, "text/csv;charset=utf-8");
    } catch {
      showToast(t("export.failed"), { severity: "error" });
    } finally {
      setPending(false);
    }
  }
  return (
    <Tooltip content={total === 0 ? t("export.empty") : t("export.hint")} semantics="description">
      <span>
        <Button
          disabled={total === 0}
          loading={pending}
          onClick={() => void download()}
          size="sm"
          type="button"
          variant="outline"
        >
          {t("export.csv")}
        </Button>
      </span>
    </Tooltip>
  );
}
