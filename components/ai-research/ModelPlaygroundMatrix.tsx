"use client";

import { Button } from "@/components/ui/Button";
import {
  type MatrixCell,
  type PlaygroundEntity,
  playgroundMatrixCellText,
  playgroundMatrixCsv,
} from "@/lib/ai-research/model-playground-view";
import { useTranslations } from "next-intl";

export function ModelPlaygroundMatrix({
  columns,
  rows,
}: Readonly<{
  columns: readonly string[];
  rows: readonly { cells: readonly MatrixCell[]; entity: PlaygroundEntity }[];
}>) {
  const t = useTranslations("projectAiResearch");
  const labels = {
    absent: t("modelPlayground.absent"),
    notNamed: t("modelPlayground.notNamed"),
    position: (position: number) => t("modelPlayground.position", { position }),
    positionCited: (position: number) => t("modelPlayground.positionCited", { position }),
  };
  const headers = [t("modelPlayground.brandColumn"), ...columns];
  const body = rows.map((row) => [
    row.entity.kind === "project"
      ? `${row.entity.label} (${t("modelPlayground.you")})`
      : row.entity.label,
    ...row.cells.map((cell) => playgroundMatrixCellText(cell, labels)),
  ]);
  function exportCsv() {
    const url = URL.createObjectURL(
      new Blob([playgroundMatrixCsv(headers, body)], { type: "text/csv" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "model-playground.csv";
    link.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="grid min-w-0 gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="m-0 text-ui-body font-medium">{t("modelPlayground.matrixTitle")}</h2>
          <p className="m-0 text-ui-caption text-fg-muted">{t("modelPlayground.matrixHint")}</p>
        </div>
        <Button onClick={exportCsv} type="button" variant="secondary">
          {t("modelPlayground.exportCsv")}
        </Button>
      </div>
      <div className="min-w-0 overflow-x-auto">
        <div className="grid w-max">
          <div className="flex">
            {headers.map((header, index) => (
              <div
                className="w-36 shrink-0 px-3 py-2 text-ui-caption font-medium text-fg-muted"
                key={`${header}-${index}`}
              >
                {header}
              </div>
            ))}
          </div>
          {body.map((row) => (
            <div className="flex" key={row[0]}>
              {row.map((cell, index) => (
                <div className="w-36 shrink-0 px-3 py-2 text-ui-body" key={`${row[0]}-${index}`}>
                  {cell}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
