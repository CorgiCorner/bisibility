import { RankReportCapacityError } from "@/lib/rank-reports/errors";
import { xlsxCellText } from "@/lib/ui/xlsx-cell-text";
import ExcelJS from "exceljs";
import { historyReportCells, historyReportHeaders } from "./report-export-formats";
import type { PreparedHistoryExport } from "./report-export-service";

export async function reportHistoryXlsx(prepared: PreparedHistoryExport) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(
    prepared.input.stream === "attempts" ? "Attempts" : "Observations",
  );
  sheet.addRow(historyReportHeaders);
  const add = (target: ExcelJS.Worksheet, row: (string | number)[]) => {
    if (row.some((value) => typeof value === "string" && value.length > 32767))
      throw new RankReportCapacityError();
    target.addRow(row.map((value) => (typeof value === "string" ? xlsxCellText(value) : value)));
  };
  for (const row of prepared.reportRows) add(sheet, historyReportCells(row));
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.getRow(1).font = { bold: true };
  const meta = workbook.addWorksheet("Report");
  const { summary, resolutions, ...manifest } = prepared.meta;
  for (const [key, value] of Object.entries(manifest)) add(meta, [key, JSON.stringify(value)]);
  const { contributions, exclusions, ...metric } = summary.metric;
  add(meta, ["summary", JSON.stringify({ ...summary, metric })]);
  const contributionSheet = workbook.addWorksheet("Contributions");
  for (const row of contributions)
    add(contributionSheet, [row.targetId, row.weight, row.value ?? "", row.delta ?? ""]);
  const exclusionSheet = workbook.addWorksheet("Exclusions");
  for (const row of exclusions) add(exclusionSheet, [row.targetId, row.reason]);
  const resolutionSheet = workbook.addWorksheet("Resolutions");
  for (const row of resolutions) add(resolutionSheet, [row.keywordId, JSON.stringify(row)]);
  return Buffer.from(await workbook.xlsx.writeBuffer()).toString("base64");
}
