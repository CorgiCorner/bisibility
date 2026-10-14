import { Readable } from "node:stream";
import { csvTextFixtures } from "@/lib/ui/csv-test-fixtures";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { exportOptions, historicKeywordFixture } from "./keyword-export-test-fixtures";
import {
  keywordExportTable,
  serializeCsv,
  serializeKeywordExportCsv,
  serializeKeywordExportXlsx,
} from "./keyword-import-export-helpers";
import { keywordExportJson } from "./keyword-import-export-json";

async function readXlsx(encoded: string) {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(
    Buffer.from(encoded, "base64") as unknown as Parameters<typeof book.xlsx.load>[0],
  );
  return book;
}

describe("spreadsheet-safe export formats", () => {
  it("neutralizes headers and textual leading prefixes while retaining numeric cells", () => {
    expect(
      serializeCsv(
        [" =header", "negative", "zero"],
        [{ " =header": "\uFEFF=1+1", negative: -3, zero: 0 }],
      ),
    ).toBe("' =header,negative,zero\n'\uFEFF=1+1,-3,0");
  });

  it("routes current export's optional text columns through the same policy", () => {
    const keyword = historicKeywordFixture();
    keyword.text = "\uFEFF=1+1";
    keyword.topic = "  +SUM(1,2)";
    keyword.intent = "@text";
    keyword.tags = [{ tag: { name: "-tag" } }];
    keyword.rankChecks[0].previousPosition = 1;
    const before = structuredClone(keyword);
    const csv = serializeKeywordExportCsv([keyword], exportOptions("current"));
    expect(csv).toBe(
      "keyword,position,target_url,tags,topic,intent,country,device,change\n'\uFEFF=1+1,3,https://example.com/today,'-tag,\"'  +SUM(1,2)\",'@text,United States,desktop,-2",
    );
    expect(keyword).toEqual(before);
  });

  it("round-trips safe CSV fixtures through ExcelJS's actual CSV importer", async () => {
    const csv = serializeCsv(
      ["text", "negative"],
      csvTextFixtures.map(({ value }) => ({ text: value, negative: -3 })),
    );
    const book = new ExcelJS.Workbook();
    const sheet = await book.csv.read(Readable.from([csv]));
    for (const [index, fixture] of csvTextFixtures.entries()) {
      const text = sheet.getCell(index + 2, 1);
      expect(text.value).toBe(fixture.exported);
      expect(text.type).toBe(ExcelJS.ValueType.String);
      expect(sheet.getCell(index + 2, 2).value).toBe(-3);
      expect(sheet.getCell(index + 2, 2).type).toBe(ExcelJS.ValueType.Number);
    }
  });

  it("CSV and XLSX retain each check's original URL, timestamp and missing value", async () => {
    const keyword = historicKeywordFixture();
    keyword.rankChecks.unshift({
      ...keyword.rankChecks[0],
      checkedAt: new Date("2026-10-09T09:00:00.000Z"),
      rankingUrl: null,
      position: null,
    });
    const before = structuredClone(keyword);
    const csv = serializeKeywordExportCsv([keyword], exportOptions());
    expect(csv).toContain(
      '2026-10-08T15:00:00.000Z,3,"https://example.com/b?q=""quoted, text""",serpapi,100,v1',
    );
    expect(csv).toContain("2026-10-01T09:00:00.000Z,5,https://example.com/a,dataforseo,100,v1");
    expect(csv).toContain("2026-10-09T09:00:00.000Z,,,serpapi,100,v1");
    expect(csv).not.toContain(keyword.targetUrl);
    const book = await readXlsx(await serializeKeywordExportXlsx([keyword], exportOptions()));
    const sheet = book.getWorksheet("Ranking history");
    expect(sheet?.getCell("D2").value).toBe("");
    expect(sheet?.getCell("D3").value).toBe(keyword.rankChecks[1].rankingUrl);
    expect(sheet?.getCell("D4").value).toBe(keyword.rankChecks[2].rankingUrl);
    expect(sheet?.getCell("B3").value).toBe(keyword.rankChecks[1].checkedAt.toISOString());
    expect(sheet?.getCell("C3").type).toBe(ExcelJS.ValueType.Number);
    expect(keyword).toEqual(before);
  });

  it.each(["current", "history"] as const)(
    "XLSX %s writes original marker strings as text, never formula objects",
    async (scope) => {
      const fixtures = [
        ...csvTextFixtures,
        { value: "first\r\nsecond\rthird\nfourth" },
        { value: "_x000D_ _x005F_ _x0000_ _x00af_ _X0041_" },
        { value: "_x005F_x000D_ _x000D__x000A_" },
        { value: "\u0001\u000B\u001F\uFFFE\uFFFF literal & < > 日本語 🐕" },
      ];
      const keywords = fixtures.map(({ value }) => ({
        ...historicKeywordFixture(),
        text: value,
      }));
      const before = structuredClone(keywords);
      const book = await readXlsx(await serializeKeywordExportXlsx(keywords, exportOptions(scope)));
      expect(keywords).toEqual(before);
      const sheet = book.getWorksheet(scope === "history" ? "Ranking history" : "Keywords");
      for (const [index, fixture] of fixtures.entries()) {
        const cell = sheet?.getCell(2 + index * (scope === "history" ? 2 : 1), 1);
        expect(cell?.value).toBe(fixture.value);
        expect(cell?.type).toBe(ExcelJS.ValueType.String);
      }
    },
  );

  it("JSON and the shared table retain original strings and nulls", () => {
    const keyword = historicKeywordFixture();
    keyword.text = "\uFEFF=1+1";
    const before = structuredClone(keyword);
    expect(keywordExportTable([keyword], exportOptions()).rows[0].keyword).toBe(keyword.text);
    const json = keywordExportJson([keyword], exportOptions(), "prj_abcdefghijklmnopqrstuvwx");
    expect(json.keywords[0].keyword).toBe(keyword.text);
    expect(json.keywords[0].rankingHistory?.map((check) => check.rankingUrl)).toEqual(
      keyword.rankChecks.map((check) => check.rankingUrl),
    );
    expect(keyword).toEqual(before);
  });

  it("preserves v1 all-observation daily and Jan1 seven-day latest weekly selection", () => {
    const keyword = historicKeywordFixture();
    keyword.rankChecks = [
      {
        ...keyword.rankChecks[0],
        checkedAt: new Date("2026-01-01T15:00:00.000Z"),
      },
      {
        ...keyword.rankChecks[1],
        checkedAt: new Date("2026-01-01T09:00:00.000Z"),
      },
      {
        ...keyword.rankChecks[1],
        checkedAt: new Date("2025-12-31T23:00:00.000Z"),
      },
    ];
    expect(keywordExportTable([keyword], exportOptions()).rows).toHaveLength(3);
    const weekly = keywordExportTable([keyword], {
      ...exportOptions(),
      granularity: "weekly",
    });
    expect(weekly.rows.map((row) => ("checked_at" in row ? row.checked_at : undefined))).toEqual([
      keyword.rankChecks[0].checkedAt,
      keyword.rankChecks[2].checkedAt,
    ]);
  });
});
