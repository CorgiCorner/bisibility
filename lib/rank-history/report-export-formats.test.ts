import { Readable } from "node:stream";
import { createReportCursorCodec } from "@/lib/rank-reports/cursor";
import { RankReportCapacityError } from "@/lib/rank-reports/errors";
import { reportAsOf, reportPolicy, reportProject } from "@/lib/rank-reports/report-test-fixture";
import ExcelJS from "exceljs";
import { describe, expect, it, vi } from "vitest";
import { historyReportHeaders, reportHistoryCsv } from "./report-export-formats";
import { prepareRankHistoryExport } from "./report-export-service";
import { historyExportSnapshotFixture } from "./report-export-test-fixture";
import { reportHistoryXlsx } from "./report-export-xlsx";

vi.mock("server-only", () => ({}));
vi.mock("./export-snapshot", () => ({
  loadHistoryExportSnapshot: async () => historyExportSnapshotFixture(),
}));
const context = { actor: { id: "viewer" }, transport: "session" as const };
const options = {
  firstAsOf: reportAsOf,
  codec: createReportCursorCodec("synthetic-format-cursor-key-for-tests"),
  reportAt: (asOf: Date) => ({
    asOf,
    limits: { maxTargets: 1000, maxChecks: 1000, maxItems: 1000 },
    policyAt: () => reportPolicy(),
    loadMetadata: async () => new Map(),
  }),
};
describe("shared report download safety", () => {
  it("keeps every attempt-specific field and numeric count in JSON, CSV and XLSX", async () => {
    const result = await prepareRankHistoryExport(
      context,
      { version: "2", range: "all", stream: "attempts" },
      reportProject.publicId,
      options,
    );
    const expected = result.reportRows.find((row) => "status" in row && row.status === "failed");
    if (!expected || !("kind" in expected) || expected.kind !== "logical_rank_check")
      throw new Error("Missing failed attempt fixture");
    const nullable = result.reportRows.find((row) => "status" in row && row.status === "completed");
    expect(nullable).toMatchObject({
      kind: "logical_rank_check",
      startedAt: null,
      finishedAt: null,
    });
    expect(expected).toMatchObject({
      kind: "logical_rank_check",
      startedAt: "2026-10-12T10:59:30.000Z",
      finishedAt: "2026-10-12T11:00:00.000Z",
      reportedProviderAttemptCount: 1,
    });
    const csvBook = new ExcelJS.Workbook();
    const countColumn = historyReportHeaders.indexOf("reported_provider_attempt_count") + 2;
    const csv = await csvBook.csv.read(Readable.from([reportHistoryCsv(result)]), {
      map: (value: string, index: number) =>
        index === countColumn && /^\d+$/.test(value) ? Number(value) : value,
    });
    const xlsxBook = new ExcelJS.Workbook();
    await xlsxBook.xlsx.read(
      Readable.from([Buffer.from(await reportHistoryXlsx(result), "base64")]),
    );
    const xlsx = xlsxBook.getWorksheet("Attempts");
    if (!xlsx) throw new Error("Missing attempts sheet");
    for (const [sheet, firstDataRow] of [
      [csv, 3],
      [xlsx, 2],
    ] as const) {
      const header = sheet.getRow(1);
      const values = new Map<string, number>();
      header.eachCell((cell, column) => values.set(String(cell.value), column));
      const field = (name: string) => {
        const column = values.get(name);
        if (!column) throw new Error(`Missing ${name}`);
        return sheet.getCell(firstDataRow, column);
      };
      expect(field("kind").value).toBe(expected.kind);
      expect(field("started_at").text).toBe(expected.startedAt);
      expect(field("finished_at").text).toBe(expected.finishedAt);
      expect(field("reported_provider_attempt_count").value).toBe(
        expected.reportedProviderAttemptCount,
      );
      expect(field("reported_provider_attempt_count").type).toBe(ExcelJS.ValueType.Number);
      const nullableRow = sheet.getRow(firstDataRow + 1);
      const startedColumn = values.get("started_at");
      const finishedColumn = values.get("finished_at");
      const kindColumn = values.get("kind");
      if (!startedColumn || !finishedColumn || !kindColumn)
        throw new Error("Missing attempt columns");
      expect(nullableRow.getCell(kindColumn).text).toBe("logical_rank_check");
      expect(nullableRow.getCell(startedColumn).text).toBe("");
      expect(nullableRow.getCell(finishedColumn).text).toBe("");
    }
  });

  it("uses the historical URL and preserves text/number types and unknown fields in CSV/XLSX", async () => {
    const result = await prepareRankHistoryExport(
      context,
      { version: "2", range: "all" },
      reportProject.publicId,
      options,
    );
    const before = structuredClone(result.reportRows);
    const csv = reportHistoryCsv(result);
    expect(csv).toContain("'=literal keyword");
    expect(csv).toContain("https://example.test/old");
    expect(csv).not.toContain("https://example.test/today");
    expect(result.reportRows).toEqual(before);
    const book = new ExcelJS.Workbook();
    await book.xlsx.read(Readable.from([Buffer.from(await reportHistoryXlsx(result), "base64")]));
    const sheet = book.getWorksheet("Observations");
    if (!sheet) throw new Error("Missing observation worksheet");
    const values = sheet.getRow(2).values;
    expect(values).toContain("=literal keyword");
    expect(values).toContain(4);
    expect(sheet.getCell(2, 2).type).toBe(ExcelJS.ValueType.String);
  });

  it.each(["observations", "attempts"] as const)(
    "round-trips original text through every %s XLSX sheet",
    async (stream) => {
      const prepared = await prepareRankHistoryExport(
        context,
        { version: "2", range: "all", stream },
        reportProject.publicId,
        options,
      );
      const first = prepared.reportRows[0];
      const resolution = prepared.meta.resolutions[0];
      if (!first || !("keywordId" in first) || !resolution)
        throw new Error("Missing report keyword fixture rows");
      const texts = [
        "first\r\nsecond\rthird\nfourth",
        "_x000D_ _x005F_x000D_ _x000D__x000A_ _X0041_",
        "\u0000\u0001\u000B\u001F\uFFFE\uFFFF & < > 日本語 🐕",
        "=SUM(1,2)\tplain text",
      ] as const;
      prepared.reportRows = texts.map((keyword) => ({ ...first, keyword }));
      prepared.meta.definitionVersion = texts[1];
      prepared.meta.summary.metric.weightProvenance.source = texts[0];
      prepared.meta.summary.metric.contributions = [
        { targetId: first.keywordId, weight: 1.25, value: 0, delta: null },
      ];
      prepared.meta.summary.metric.exclusions = [{ targetId: first.keywordId, reason: texts[1] }];
      const before = structuredClone(prepared);
      const book = new ExcelJS.Workbook();
      await book.xlsx.read(
        Readable.from([Buffer.from(await reportHistoryXlsx(prepared), "base64")]),
      );
      const sheet = book.getWorksheet(stream === "attempts" ? "Attempts" : "Observations");
      if (!sheet) throw new Error("Missing report worksheet");
      const keywordColumn = historyReportHeaders.indexOf("keyword") + 1;
      for (const [index, text] of texts.entries()) {
        const cell = sheet.getCell(index + 2, keywordColumn);
        expect(cell.value).toBe(text);
        expect(cell.type).toBe(ExcelJS.ValueType.String);
      }
      const metadata = book.getWorksheet("Report");
      if (!metadata) throw new Error("Missing report metadata worksheet");
      const values = new Map<string, ExcelJS.CellValue>();
      metadata.eachRow((row) => values.set(String(row.getCell(1).value), row.getCell(2).value));
      expect(values.get("definitionVersion")).toBe(JSON.stringify(texts[1]));
      expect(values.get("summary")).toContain(JSON.stringify(texts[0]));
      expect(book.getWorksheet("Contributions")?.getCell("B1").value).toBe(1.25);
      expect(book.getWorksheet("Contributions")?.getCell("B1").type).toBe(ExcelJS.ValueType.Number);
      expect(book.getWorksheet("Contributions")?.getCell("C1").value).toBe(0);
      expect(book.getWorksheet("Contributions")?.getCell("D1").value).toBe("");
      expect(book.getWorksheet("Exclusions")?.getCell("B1").value).toBe(texts[1]);
      expect(book.getWorksheet("Resolutions")?.getCell("A1").value).toBe(resolution.keywordId);
      expect(book.getWorksheet("Resolutions")?.getCell("B1").value).toBe(
        JSON.stringify(resolution),
      );
      expect(prepared).toEqual(before);
    },
  );

  it("applies the existing XLSX cell limit to original text before encoding", async () => {
    const prepared = await prepareRankHistoryExport(
      context,
      { version: "2", range: "all" },
      reportProject.publicId,
      options,
    );
    const first = prepared.reportRows[0];
    if (!first) throw new Error("Missing report fixture row");
    const original = "_x000D_".repeat(4681);
    expect(original.length).toBe(32767);
    prepared.reportRows = [{ ...first, keyword: original }];
    const book = new ExcelJS.Workbook();
    await book.xlsx.read(Readable.from([Buffer.from(await reportHistoryXlsx(prepared), "base64")]));
    expect(book.getWorksheet("Observations")?.getCell("B2").value).toBe(original);
    prepared.reportRows = [{ ...first, keyword: `${original}a` }];
    await expect(reportHistoryXlsx(prepared)).rejects.toBeInstanceOf(RankReportCapacityError);
  });
});
