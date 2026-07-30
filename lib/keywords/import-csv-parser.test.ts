import { addKeywordsSchema, KEYWORD_IMPORT_MAX } from "@/lib/schemas/keyword";
import { describe, expect, it } from "vitest";
import { parseKeywordImportCsvKeywords, parseKeywordImportCsvRows } from "./import-csv-parser";

describe("keyword import CSV parser", () => {
  it("parses structured rows from reordered columns", () => {
    const rows = parseKeywordImportCsvRows(
      'device,country,keyword,target_url,tags\nMOBILE,GB,rank tracker,/rank,"Core; Product"',
    );

    expect(rows).toEqual([
      {
        city: undefined,
        device: "MOBILE",
        keyword: "rank tracker",
        location: "GB",
        locationKey: undefined,
        row: 2,
        tags: ["Core", "Product"],
        targetUrl: "/rank",
        topic: undefined,
        intent: undefined,
      },
    ]);
  });

  it("does not read omitted optional columns from fallback positions", () => {
    const rows = parseKeywordImportCsvRows("keyword,country,device\nrank tracker,GB,mobile");

    expect(rows).toEqual([
      {
        city: undefined,
        device: "mobile",
        keyword: "rank tracker",
        location: "GB",
        locationKey: undefined,
        row: 2,
        tags: undefined,
        targetUrl: undefined,
        topic: undefined,
        intent: undefined,
      },
    ]);
  });

  it("parses CRLF and LF line endings identically", () => {
    const lf = parseKeywordImportCsvRows(
      "keyword,country,device\nrank tracker,US,desktop\nmobile serp,GB,mobile",
    );
    const crlf = parseKeywordImportCsvRows(
      "keyword,country,device\r\nrank tracker,US,desktop\r\nmobile serp,GB,mobile",
    );

    expect(crlf).toEqual(lf);
    expect(crlf).toHaveLength(2);
  });

  it("recognizes a UTF-8 BOM before the keyword header", () => {
    const rows = parseKeywordImportCsvRows(
      "\uFEFFkeyword,target_url,tags,country,device\nrank tracker,/rank,Core,US,desktop",
    );

    expect(rows).toEqual([
      {
        city: undefined,
        device: "desktop",
        keyword: "rank tracker",
        location: "US",
        locationKey: undefined,
        row: 2,
        tags: ["Core"],
        targetUrl: "/rank",
        topic: undefined,
        intent: undefined,
      },
    ]);
  });

  it("rejects semicolon-delimited files with actionable guidance", () => {
    expect(() =>
      parseKeywordImportCsvRows("keyword;country;device\nrank tracker;PL;desktop"),
    ).toThrow(
      "This file appears to use semicolons (;) as separators. Export it as comma-separated CSV and try again.",
    );
  });

  it("rejects tab-delimited files with actionable guidance", () => {
    expect(() =>
      parseKeywordImportCsvRows("keyword\tcountry\tdevice\nrank tracker\tPL\tdesktop"),
    ).toThrow(
      "This file appears to use tabs as separators. Export it as comma-separated CSV and try again.",
    );
  });

  it("keeps legitimate single-column comma CSV files valid", () => {
    expect(parseKeywordImportCsvKeywords("keyword\nrank tracker\nseo api")).toEqual([
      "rank tracker",
      "seo api",
    ]);
  });

  it("keeps a single recognized alias word as headerless keyword data", () => {
    expect(parseKeywordImportCsvKeywords("geo\nurl\nrank tracker")).toEqual([
      "geo",
      "url",
      "rank tracker",
    ]);
  });

  it("detects semicolon delimiters after a UTF-8 BOM", () => {
    expect(() => parseKeywordImportCsvRows("\uFEFFkeyword;country\nrank tracker;PL")).toThrow(
      "This file appears to use semicolons (;) as separators.",
    );
  });

  it("returns no rows for an empty CSV payload", () => {
    expect(parseKeywordImportCsvRows("\n\r\n  ")).toEqual([]);
  });

  it("parses city and location key header aliases", () => {
    const rows = parseKeywordImportCsvRows(
      "keyword,location_key,city,country,topic,intent\nrank tracker,US/Texas/Austin,Austin,US,Product,commercial",
    );

    expect(rows[0]).toMatchObject({
      city: "Austin",
      intent: "commercial",
      keyword: "rank tracker",
      location: "US",
      locationKey: "US/Texas/Austin",
      topic: "Product",
    });
  });

  it("keeps headerless CSVs on the five-column layout", () => {
    const rows = parseKeywordImportCsvRows("rank tracker,/rank,Core,US,desktop,Paris,FR/Paris");

    expect(rows).toEqual([
      {
        city: undefined,
        device: "desktop",
        keyword: "rank tracker",
        location: "US",
        locationKey: undefined,
        row: 1,
        tags: ["Core"],
        targetUrl: "/rank",
        topic: undefined,
        intent: undefined,
      },
    ]);
  });

  it("rejects recognizable headers that omit the required keyword column", () => {
    expect(() =>
      parseKeywordImportCsvRows("target_url,tags,country,device\n/rank,Core,US,desktop"),
    ).toThrow('Missing required keyword column. Add a column named "keyword" and try again.');
  });

  it("rejects an unterminated quoted field as malformed CSV", () => {
    expect(() => parseKeywordImportCsvRows('keyword,target_url\nrank tracker,"/rank')).toThrow(
      "Malformed CSV: quoted field is missing a closing quote.",
    );
  });

  it("preserves embedded newlines and filters rows without keywords", () => {
    expect(parseKeywordImportCsvRows('keyword,target_url\n"rank\ntracker",/rank')[0]?.keyword).toBe(
      "rank\ntracker",
    );
    expect(parseKeywordImportCsvKeywords("keyword,country\n,US\nrank tracker,GB")).toEqual([
      "rank tracker",
    ]);
  });

  it("passes parsed rows through the keyword import row limit", () => {
    const csv = [
      "keyword",
      ...Array.from({ length: KEYWORD_IMPORT_MAX + 1 }, (_, index) => `keyword ${index}`),
    ].join("\n");
    const rows = parseKeywordImportCsvRows(csv);

    expect(rows).toHaveLength(KEYWORD_IMPORT_MAX + 1);
    expect(() => addKeywordsSchema.parse({ projectId: "prj_1", rows })).toThrow(
      "Array must contain at most 500 element(s)",
    );
  });
});
