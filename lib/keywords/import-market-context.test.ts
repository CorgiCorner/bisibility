import { describe, expect, it } from "vitest";
import { parseKeywordImportCsvRows } from "./import-csv-parser";
import { keywordImportTemplateForMarkets } from "./import-csv-template";
import { initialImportMarketKey } from "./import-market-context";

const market = {
  canonicalKey: "ES@en",
  displayName: "Spain",
  id: "pmkt_es",
  languageLabel: "English",
  status: "paused" as const,
};
describe("Import market context", () => {
  it("selects an explicit or sole paused market without guessing among multiple markets", () => {
    expect(initialImportMarketKey({ markets: [] })).toBeNull();
    expect(initialImportMarketKey({ markets: [market] })).toBe("ES@en");
    const markets = [market, { ...market, canonicalKey: "US" }];
    expect(initialImportMarketKey({ markets })).toBeNull();
    expect(initialImportMarketKey({ markets, initialMarketKey: "ES@en" })).toBe("ES@en");
  });
  it("leaves template geography empty when the import has a selected market", () => {
    const rows = parseKeywordImportCsvRows(keywordImportTemplateForMarkets(["ES@en"], "ES@en"));
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => !row.location && !row.language && !row.locationKey)).toBe(true);
  });
  it("uses only real project locations in the multi-market template", () => {
    const keys = ["ES@en", "US/Texas/Austin"];
    const rows = parseKeywordImportCsvRows(keywordImportTemplateForMarkets(keys, null));
    expect(rows.map((row) => row.locationKey)).toEqual([keys[0], keys[1], keys[0]]);
  });
});
