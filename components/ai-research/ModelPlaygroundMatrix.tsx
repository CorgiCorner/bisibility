"use client";

import { Button } from "@/components/ui/Button";
import {
  type ResultCell,
  type ResultColumn,
  type ResultMatrixRow,
  resultMatrixCsv,
} from "@/lib/model-playground/result-view";
import { useTranslations } from "next-intl";
import "./ModelPlaygroundColumns.css";

export function ModelPlaygroundMatrix({
  columns,
  rows,
}: Readonly<{ columns: readonly ResultColumn[]; rows: readonly ResultMatrixRow[] }>) {
  const t = useTranslations("projectAiResearch");
  const c = useTranslations("projectAiResearch.modelPlayground");
  function cellText(cell: ResultCell) {
    if (cell.kind !== "position") return c(cell.kind === "unknown" ? "unknown" : "notNamed");
    return t(cell.cited ? "modelPlayground.positionCited" : "modelPlayground.position", {
      position: cell.position,
    });
  }
  function exportCsv() {
    const url = URL.createObjectURL(
      new Blob([resultMatrixCsv(columns, rows, cellText)], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "model-playground.csv";
    link.click();
    URL.revokeObjectURL(url);
  }
  return (
    <section className="grid min-w-0 gap-3" data-model-matrix>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="m-0 text-ui-body font-medium">{t("modelPlayground.matrixTitle")}</h2>
          <p className="m-0 text-ui-caption text-fg-muted">{c("trackedScope")}</p>
        </div>
        <Button onClick={exportCsv} size="sm" variant="outline">
          {t("modelPlayground.exportCsv")}
        </Button>
      </div>
      <div className="min-w-0 overflow-x-auto rounded-card border border-border">
        {/* biome-ignore lint/a11y/useSemanticElements: Shared subgrid tracks require the approved div-based ARIA table. */}
        <div
          aria-label={t("modelPlayground.matrixTitle")}
          aria-colcount={columns.length + 1}
          aria-rowcount={rows.length + 1}
          className="model-playground-matrix"
          role="table"
          data-model-matrix-columns={columns.length + 1}
        >
          {/* biome-ignore lint/a11y/useSemanticElements: Rowgroups preserve the table's shared subgrid tracks. */}
          <div className="model-playground-matrix-group" role="rowgroup">
            {/* biome-ignore lint/a11y/useSemanticElements: Rows inherit the table's subgrid tracks. */}
            <div className="model-playground-matrix-row" role="row" tabIndex={-1}>
              {/* biome-ignore lint/a11y/useSemanticElements: ARIA column headers occupy the shared subgrid tracks. */}
              <div
                className="model-playground-matrix-cell px-3 py-2 text-ui-caption font-bold"
                role="columnheader"
                tabIndex={-1}
              >
                {t("modelPlayground.brandColumn")}
              </div>
              {columns.map((column, index) => (
                // biome-ignore lint/a11y/useSemanticElements: ARIA column headers occupy the shared subgrid tracks.
                <div
                  className="model-playground-matrix-cell px-3 py-2 text-ui-caption font-bold"
                  key={column.id}
                  role="columnheader"
                  tabIndex={-1}
                >
                  <span className="block">
                    {column.label}
                    {columns.filter(
                      (other) =>
                        other.label === column.label &&
                        other.providerLabel === column.providerLabel,
                    ).length > 1
                      ? ` (${index + 1})`
                      : ""}
                  </span>
                  <span className="block font-normal text-fg-muted">
                    {column.provenance === "api_response"
                      ? `${column.providerLabel} · ${c("apiResponse")}`
                      : null}
                  </span>
                </div>
              ))}
            </div>
          </div>
          {/* biome-ignore lint/a11y/useSemanticElements: Rowgroups preserve the table's shared subgrid tracks. */}
          <div className="model-playground-matrix-group" role="rowgroup">
            {rows.map((row) => (
              // biome-ignore lint/a11y/useSemanticElements: Rows inherit the table's subgrid tracks.
              <div
                className="model-playground-matrix-row"
                key={row.entity.id}
                role="row"
                tabIndex={-1}
              >
                {/* biome-ignore lint/a11y/useSemanticElements: ARIA row headers preserve the entity's table semantics. */}
                <div
                  className="model-playground-matrix-cell px-3 py-2 text-ui-body font-medium"
                  role="rowheader"
                  tabIndex={-1}
                >
                  {row.entity.label}
                  {row.entity.kind === "project" ? ` (${t("modelPlayground.you")})` : ""}
                </div>
                {row.cells.map((cell, index) => (
                  // biome-ignore lint/a11y/useSemanticElements: ARIA cells occupy the shared subgrid tracks.
                  <div
                    className="model-playground-matrix-cell px-3 py-2 text-ui-body"
                    role="cell"
                    data-cell-kind={cell.kind}
                    key={columns[index].id}
                  >
                    {cellText(cell)}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
