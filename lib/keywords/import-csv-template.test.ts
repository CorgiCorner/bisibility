import { describe, expect, it } from "vitest";
import { parseKeywordImportCsvTable } from "./import-csv-parser";
import { keywordImportTemplateCsv, keywordImportTemplateForMarkets } from "./import-csv-template";

describe("downloaded keyword import template", () => {
  it("preserves static rows and headers for no markets or an explicit default", () => {
    expect(keywordImportTemplateForMarkets([], null)).toBe(keywordImportTemplateCsv);
    expect(keywordImportTemplateForMarkets(["US@en"], "US@en")).toBe(keywordImportTemplateCsv);
  });

  it("preserves the exact canonical market key parsed by the importer", () => {
    const keys = ["US@en", "PL@pl"];
    const csv = keywordImportTemplateForMarkets(keys, null);
    const table = parseKeywordImportCsvTable(csv);
    expect(csv.split("\n")[0]).toBe(keywordImportTemplateCsv.split("\n")[0] + ",location_key");
    expect(table.dataRows.map((row) => row[table.columns.locationKey])).toEqual([
      "US@en",
      "PL@pl",
      "US@en",
    ]);
    const original = parseKeywordImportCsvTable(keywordImportTemplateCsv);
    expect(table.dataRows.map((row) => row.slice(0, -1))).toEqual(original.dataRows);
    expect(keys).toEqual(["US@en", "PL@pl"]);
  });

  it("neutralizes unexpected textual market values and escapes CR without altering the source keys", () => {
    const keys = ["\uFEFF=1+1", "first\rsecond", 'quoted, "key"'];
    const csv = keywordImportTemplateForMarkets(keys, null);
    const table = parseKeywordImportCsvTable(csv);
    expect(table.dataRows.map((row) => row[table.columns.locationKey])).toEqual([
      "'\uFEFF=1+1",
      "first\rsecond",
      'quoted, "key"',
    ]);
    expect(csv).toContain('"first\rsecond"');
    expect(keys[0]).toBe("\uFEFF=1+1");
  });
});
