import { parseCsvKeywords } from "@/lib/keywords/add-keyword-drawer-shared";
import ExcelJS from "exceljs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type KeywordExportColumn,
  type KeywordExportOptions,
  type KeywordExportRow,
  keywordExportColumns,
  keywordExportJson,
  keywordExportOptions,
  keywordExportTable,
  keywordImportKey,
  parseKeywordImportCsv,
  serializeCsv,
  serializeKeywordExportCsv,
  serializeKeywordExportXlsx,
} from "./keyword-import-export-helpers";

const FIXED_NOW = new Date("2026-07-20T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

function daysBeforeFixedNow(days: number) {
  return new Date(FIXED_NOW.getTime() - days * DAY_MS);
}

function exportOptions(patch: Partial<KeywordExportOptions> = {}): KeywordExportOptions {
  const columns = Object.fromEntries(
    keywordExportColumns.map((column) => [column, true]),
  ) as Record<KeywordExportColumn, boolean>;
  return {
    columns,
    granularity: "daily",
    range: "all",
    scope: "current",
    ...patch,
  };
}

function keywordFixture(): KeywordExportRow {
  return {
    createdAt: daysBeforeFixedNow(49),
    device: "desktop",
    location: "United States",
    publicId: "kw_1",
    rankChecks: [
      {
        checkedAt: daysBeforeFixedNow(1),
        position: 3,
        previousPosition: 7,
        rankingUrl: "https://example.com/rank,tracker",
      },
      {
        checkedAt: daysBeforeFixedNow(2),
        position: 4,
        previousPosition: 6,
        rankingUrl: "https://example.com/older",
      },
    ],
    tags: [{ tag: { name: "core, seo" } }, { tag: { name: "product" } }],
    targetUrl: "/rank",
    text: 'rank "tracker"',
    topic: "Product",
    intent: "commercial",
  };
}

describe("keyword import/export CSV helpers", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("parses quoted CSV rows, headers, defaults, and validation errors", () => {
    const result = parseKeywordImportCsv(`keyword,target_url,tags,country,device,topic,intent\r
"rank, tracker",/rank,"core; seo",US,desktop,Product,commercial\r
"quote ""test""",,tag,GB,mobile\r
bad,not a url,tag,US,desktop`);

    expect(result.received).toBe(3);
    expect(result.errors).toEqual([
      { message: "Target URL must be an absolute URL or a path.", row: 4 },
    ]);
    expect(result.parsed).toMatchObject([
      {
        device: "desktop",
        keyword: "rank, tracker",
        location: "United States",
        row: 2,
        tags: ["core", "seo"],
        targetUrl: "/rank",
        topic: "Product",
        intent: "commercial",
      },
      {
        device: "mobile",
        keyword: 'quote "test"',
        location: "United Kingdom",
        row: 3,
        tags: ["tag"],
      },
    ]);
  });

  it("parses headerless keyword-only CSV with add keyword defaults", () => {
    const result = parseKeywordImportCsv("first keyword\nsecond keyword");

    expect(result.errors).toEqual([]);
    expect(result.parsed).toMatchObject([
      { device: "desktop", keyword: "first keyword", location: "United States" },
      { device: "desktop", keyword: "second keyword", location: "United States" },
    ]);
  });

  it("lets row city and location key values override import defaults", () => {
    const result = parseKeywordImportCsv(
      [
        "keyword,country,city,location_key,device",
        "key row,,London,GB/England/London,mobile",
        "city row,,Austin,,desktop",
        "country row,United Kingdom,,,desktop",
        "default row,,,,desktop",
      ].join("\n"),
      {
        city: "New York",
        country: "United States",
        device: "desktop",
        locationKey: "US/New York/New York",
      },
    );

    expect(result.errors).toEqual([]);
    expect(result.parsed).toMatchObject([
      {
        city: "London",
        keyword: "key row",
        location: "United States",
        locationKey: "GB/England/London",
      },
      { city: "Austin", keyword: "city row", location: "United States", locationKey: undefined },
      { city: null, keyword: "country row", location: "United Kingdom", locationKey: undefined },
      {
        city: "New York",
        keyword: "default row",
        location: "United States",
        locationKey: "US/New York/New York",
      },
    ]);
  });

  it("builds duplicate keys from canonical country codes when available", () => {
    const row = { device: "desktop" as const, keyword: "rank tracker", location: "United Kingdom" };

    expect(keywordImportKey(row)).toBe(keywordImportKey({ ...row, locationKey: "GB" }));
    expect(keywordImportKey(row)).toBe(keywordImportKey({ ...row, location: "GB" }));
  });

  it("uses city in duplicate keys only when no canonical location key exists", () => {
    const row = { device: "desktop" as const, keyword: "rank tracker", location: "United States" };

    expect(keywordImportKey({ ...row, city: "Austin" })).not.toBe(
      keywordImportKey({ ...row, city: "Dallas" }),
    );
    expect(keywordImportKey({ ...row, city: "Austin", locationKey: "US" })).toBe(
      keywordImportKey({ ...row, city: "Dallas", locationKey: "US" }),
    );
  });

  it("normalizes custom location whitespace and reports malformed quoted CSV", () => {
    expect(
      keywordImportKey({
        device: "desktop",
        keyword: "rank tracker",
        location: "  Custom   Market  ",
      }),
    ).toContain("Custom Market");
    expect(parseKeywordImportCsv('keyword\n"unterminated')).toMatchObject({
      errors: [{ message: expect.stringContaining("closing quote"), row: 2 }],
      parsed: [],
      received: 0,
    });
  });

  it.each([
    [
      "standard header",
      "keyword,target_url,tags,country,device\nrank tracker,/rank,Core,US,desktop",
      ["rank tracker"],
    ],
    ["headerless rows", "rank tracker\nmobile serp", ["rank tracker", "mobile serp"]],
    [
      "reordered columns",
      "target_url,keyword,tags,country,device\n/rank,rank tracker,Core,US,desktop",
      ["rank tracker"],
    ],
    [
      "keyword header outside first column",
      "target_url,tags,keyword,country,device\n/rank,Core,rank tracker,US,desktop\n/mobile,Product,mobile serp,GB,mobile",
      ["rank tracker", "mobile serp"],
    ],
  ])("matches client and server import counts for %s", (_name, csv, expectedKeywords) => {
    const clientKeywords = parseCsvKeywords(csv);
    const serverResult = parseKeywordImportCsv(csv);

    expect(clientKeywords).toEqual(expectedKeywords);
    expect(serverResult.errors).toEqual([]);
    expect(clientKeywords).toHaveLength(serverResult.received);
    expect(clientKeywords).toHaveLength(serverResult.parsed.length);
  });

  it("serializes CSV cells with quotes, commas, and newlines", () => {
    const csv = serializeCsv(
      ["keyword", "note"],
      [{ keyword: 'rank "tracker"', note: "line one\nline,two" }],
    );

    expect(csv).toBe('keyword,note\n"rank ""tracker""","line one\nline,two"');
  });

  it("normalizes export options and serializes supported primitive values", () => {
    const options = keywordExportOptions({
      columns: { url: true },
      granularity: "weekly",
      range: "30",
      scope: "current",
    });
    expect(options.columns).toMatchObject({ tags: false, url: true });
    const named = function namedFunction() {};
    const csv = serializeCsv(
      ["nil", "date", "object", "fn", "symbol", "bool", "number", "bigint"],
      [
        {
          bigint: 42n,
          bool: true,
          date: new Date("2026-07-01T00:00:00.000Z"),
          fn: named,
          nil: null,
          number: 12.5,
          object: { ok: true },
          symbol: Symbol("marker"),
        },
      ],
    );
    expect(csv).toContain(
      '2026-07-01T00:00:00.000Z,"{""ok"":true}",namedFunction,marker,true,12.5,42',
    );
    expect(serializeCsv(["false", "symbol"], [{ false: false, symbol: Symbol() }])).toBe(
      "false,symbol\nfalse,",
    );
  });

  it("serializes current keyword rows with selected import-compatible columns", () => {
    const csv = serializeKeywordExportCsv([keywordFixture()], exportOptions());

    expect(csv.split("\n")[0]).toBe(
      "keyword,position,target_url,tags,topic,intent,country,device,change",
    );
    expect(csv).toContain(
      '"rank ""tracker""",3,/rank,"core, seo;product",Product,commercial,United States,desktop,4',
    );
  });

  it("serializes ranking history rows as CSV", () => {
    const csv = serializeKeywordExportCsv([keywordFixture()], exportOptions({ scope: "history" }));

    expect(csv.split("\n")[0]).toBe("keyword,checked_at,position,ranking_url");
    expect(csv).toContain(
      `"rank ""tracker""",${daysBeforeFixedNow(1).toISOString()},3,"https://example.com/rank,tracker"`,
    );
    expect(csv).toContain(
      `"rank ""tracker""",${daysBeforeFixedNow(2).toISOString()},4,https://example.com/older`,
    );
  });

  it("deduplicates weekly history and applies date cutoffs", () => {
    const keyword = keywordFixture();
    keyword.rankChecks = [
      ...keyword.rankChecks,
      {
        checkedAt: daysBeforeFixedNow(31),
        position: null,
        previousPosition: null,
        rankingUrl: null,
      },
    ];
    const table = keywordExportTable(
      [keyword],
      exportOptions({ granularity: "weekly", range: "30", scope: "history" }),
    );
    expect(table.rows).toHaveLength(1);
  });

  it("serializes ranking history timestamps as XLSX text cells", async () => {
    const encoded = await serializeKeywordExportXlsx(
      [keywordFixture()],
      exportOptions({ scope: "history" }),
    );
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      Buffer.from(encoded, "base64") as unknown as Parameters<typeof workbook.xlsx.load>[0],
    );
    const checkedAt = workbook.getWorksheet("Ranking history")?.getCell("B2").value;

    expect(Buffer.from(encoded, "base64").subarray(0, 2).toString()).toBe("PK");
    expect(checkedAt).toBe(daysBeforeFixedNow(1).toISOString());
    expect(typeof checkedAt).toBe("string");
  });

  it("serializes JSON with ranking history records", () => {
    const payload = keywordExportJson(
      [keywordFixture()],
      exportOptions({ scope: "history" }),
      "prj_1",
    );

    expect(payload).toMatchObject({
      keywords: [
        {
          id: "kw_1",
          intent: "commercial",
          keyword: 'rank "tracker"',
          rankingHistory: [
            {
              checkedAt: daysBeforeFixedNow(1).toISOString(),
              position: 3,
              previousPosition: 7,
              rankingUrl: "https://example.com/rank,tracker",
            },
            {
              checkedAt: daysBeforeFixedNow(2).toISOString(),
              position: 4,
            },
          ],
          topic: "Product",
        },
      ],
      projectId: "prj_1",
      scope: "history",
    });
  });
});
