import ExcelJS from "exceljs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  exportKeywords,
  importKeywordsFromCsv,
  previewKeywordImportFile,
} from "./keyword-import-export";
import { refreshKeywordViewsAfterImport } from "./keyword-import-refresh";

const PROJECT_PUBLIC_ID = "prj_abcdefghijklmnopqrstuvwx";
const KEYWORD_PUBLIC_ID = "kw_abcdefghijklmnopqrstuvwx";

const mocks = vi.hoisted(() => {
  const prisma = {
    $executeRaw: vi.fn(),
    $transaction: vi.fn(),
    auditLog: { create: vi.fn() },
    keyword: { createMany: vi.fn(), findMany: vi.fn() },
    keywordSchedule: { createMany: vi.fn() },
    keywordTag: { createMany: vi.fn() },
    location: { findUnique: vi.fn(), upsert: vi.fn() },
    project: { findFirst: vi.fn(), findUnique: vi.fn() },
    tag: { createMany: vi.fn(), findMany: vi.fn() },
    user: { findUnique: vi.fn() },
  };
  return {
    authorize: vi.fn(),
    prisma,
    requireSession: vi.fn(),
    resolveKeywordLocation: vi.fn(),
    revalidatePath: vi.fn(),
  };
});

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({ get: vi.fn() })) }));
vi.mock("@/lib/auth/authorize", () => ({ authorize: mocks.authorize }));
vi.mock("@/lib/auth/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/serp/location-service", () => ({
  resolveKeywordLocation: mocks.resolveKeywordLocation,
}));

function resolvedLocation(country: string, warning: string | null = null) {
  const key = country === "United Kingdom" ? "GB" : "US";
  return {
    degraded: Boolean(warning),
    location: {
      canonicalKey: key,
      cityName: null,
      countryCode: key,
      displayName: country,
      gl: key.toLowerCase(),
      hl: "en",
      id: `loc_${key}`,
      kind: "country",
      languageLabel: "English",
      primaryGeoCode: null,
      primaryGeoName: country,
      regionCode: null,
      secondaryGeoName: country,
    },
    warning,
  };
}

function storedKeyword(
  text: string,
  id: string,
  publicId: string,
  locationId: string,
  device: "desktop" | "mobile",
  targetUrl: string | null,
) {
  return {
    device,
    id,
    intent: null,
    locationId,
    publicId,
    targetUrl,
    text,
    topic: null,
  };
}

async function workbookFile(
  headers = ["keyword", "target_url", "tags", "country", "device", "topic", "intent"],
) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Keywords");
  sheet.addRow(headers);
  sheet.addRow(["rank tracker", "/rank", "Core;SEO", "US", "desktop", "Product", "commercial"]);
  sheet.addRow(["mobile serp", "/mobile", "Product", "GB", "mobile", "Product", "comparison"]);
  const buffer = await workbook.xlsx.writeBuffer();
  const bytes = buffer instanceof ArrayBuffer ? buffer : new Uint8Array(buffer).buffer;
  const file = new File([bytes], "keywords.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  Object.defineProperty(file, "arrayBuffer", { value: async () => bytes });
  return file;
}

describe("keyword workbook import action", () => {
  const maxImportFileBytes = 5 * 1024 * 1024;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$executeRaw.mockResolvedValue(0);
    mocks.prisma.$transaction.mockImplementation((callback) => callback(mocks.prisma));
    mocks.requireSession.mockResolvedValue({ user: { id: "user_1" } });
    mocks.prisma.user.findUnique.mockResolvedValue({
      memberships: [{ projectId: "project_1", role: "admin" }],
      role: "member",
    });
    mocks.prisma.project.findFirst.mockResolvedValue({
      id: "project_1",
      ownerId: "user_1",
      publicId: PROJECT_PUBLIC_ID,
    });
    mocks.resolveKeywordLocation.mockImplementation(
      async (input: {
        city?: string | null;
        country?: string;
        selection?: { canonicalKey: string };
      }) => {
        const country =
          input.country === "GB" ||
          input.country === "United Kingdom" ||
          input.selection?.canonicalKey === "GB"
            ? "United Kingdom"
            : "United States";
        const warning = input.city
          ? `Could not resolve "${input.city}" in ${country}; tracking at country level.`
          : null;
        return resolvedLocation(country, warning);
      },
    );
    mocks.prisma.keyword.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        storedKeyword(
          "rank tracker",
          "keyword_1",
          "kw_abcdefghijklmnopqrstuvwx",
          "loc_US",
          "desktop",
          "/rank",
        ),
        storedKeyword(
          "mobile serp",
          "keyword_2",
          "kw_bbcdefghijklmnopqrstuvwx",
          "loc_GB",
          "mobile",
          "/mobile",
        ),
      ]);
    mocks.prisma.tag.findMany.mockResolvedValue([
      { id: "tag_1", name: "Core" },
      { id: "tag_2", name: "SEO" },
      { id: "tag_3", name: "Product" },
    ]);
  });

  it("parses XLSX uploads with the same columns as CSV imports", async () => {
    const formData = new FormData();
    formData.set("file", await workbookFile());
    formData.set("projectId", PROJECT_PUBLIC_ID);

    const result = await importKeywordsFromCsv(formData);

    expect(result).toMatchObject({ created: 2, errors: [], failed: 0, parsed: 2, received: 2 });
    expect(mocks.prisma.keyword.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            device: "desktop",
            location: "United States",
            targetUrl: "/rank",
            text: "rank tracker",
            topic: "Product",
            intent: "commercial",
          }),
          expect.objectContaining({
            device: "mobile",
            location: "United Kingdom",
            targetUrl: "/mobile",
            text: "mobile serp",
            topic: "Product",
            intent: "comparison",
          }),
        ],
      }),
    );
    expect(mocks.prisma.tag.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            name: "Core",
            projectId: "project_1",
            publicId: expect.stringMatching(/^tag_[a-z][a-z0-9]{23}$/),
          }),
          expect.objectContaining({
            name: "SEO",
            projectId: "project_1",
            publicId: expect.stringMatching(/^tag_[a-z][a-z0-9]{23}$/),
          }),
          expect.objectContaining({
            name: "Product",
            projectId: "project_1",
            publicId: expect.stringMatching(/^tag_[a-z][a-z0-9]{23}$/),
          }),
        ],
      }),
    );
    expect(mocks.prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "keyword.csv_import",
        actorId: "user_1",
        after: {
          created: ["kw_abcdefghijklmnopqrstuvwx", "kw_bbcdefghijklmnopqrstuvwx"],
          failed: 0,
          skipped: 0,
        },
        projectId: "project_1",
        targetId: PROJECT_PUBLIC_ID,
        targetType: "project",
      }),
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/app/[project]/keywords", "page");
  });

  it("defers wizard revalidation until the completed result is dismissed", async () => {
    const formData = new FormData();
    formData.set("file", await workbookFile());
    formData.set("projectId", PROJECT_PUBLIC_ID);
    formData.set("refresh", "deferred");

    await expect(importKeywordsFromCsv(formData)).resolves.toMatchObject({ created: 2 });

    expect(mocks.revalidatePath).not.toHaveBeenCalled();

    await refreshKeywordViewsAfterImport();

    expect(mocks.revalidatePath).toHaveBeenCalledWith("/app/[project]/keywords", "page");
  });

  it("rejects an XLSX workbook missing the keyword column before import", async () => {
    const formData = new FormData();
    formData.set("file", await workbookFile(["target_url", "tags", "country", "device"]));
    formData.set("projectId", PROJECT_PUBLIC_ID);

    await expect(previewKeywordImportFile(formData)).resolves.toEqual({
      error: {
        code: "missing_required_column",
        message: 'Missing required keyword column. Add a column named "keyword" and try again.',
        row: 1,
      },
      ok: false,
    });
    await expect(importKeywordsFromCsv(formData)).resolves.toMatchObject({
      created: 0,
      errors: [
        {
          message: 'Missing required keyword column. Add a column named "keyword" and try again.',
          row: 1,
        },
      ],
      failed: 1,
      parsed: 0,
    });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(mocks.prisma.keyword.createMany).not.toHaveBeenCalled();
    expect(mocks.prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("keeps unreadable workbook failures throwable", async () => {
    const formData = new FormData();
    const bytes = new TextEncoder().encode("not an xlsx workbook").buffer;
    const file = new File([bytes], "keywords.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    Object.defineProperty(file, "arrayBuffer", {
      value: async () => bytes,
    });
    formData.set("file", file);

    await expect(previewKeywordImportFile(formData)).rejects.toThrow(
      "Could not read the spreadsheet import.",
    );
  });

  it("rejects legacy XLS files with save-as-XLSX guidance", async () => {
    const formData = new FormData();
    const file = new File(["legacy workbook"], "keywords.xls", {
      type: "application/vnd.ms-excel",
    });
    formData.set("file", file);

    await expect(previewKeywordImportFile(formData)).rejects.toThrow(
      "Legacy .xls files are not supported. Save the workbook as .xlsx and try again.",
    );
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("returns validation errors for an unterminated quoted CSV field without writing", async () => {
    mocks.prisma.keyword.findMany.mockReset();
    mocks.prisma.keyword.findMany.mockResolvedValue([]);

    const result = await importKeywordsFromCsv({
      csv: 'keyword,target_url\nrank tracker,"not a url',
      projectId: PROJECT_PUBLIC_ID,
    });

    expect(result).toMatchObject({
      created: 0,
      errors: [{ message: "Malformed CSV: quoted field is missing a closing quote.", row: 2 }],
      failed: 1,
      parsed: 0,
      skipped: 0,
    });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(mocks.prisma.keyword.createMany).not.toHaveBeenCalled();
    expect(mocks.prisma.keywordSchedule.createMany).not.toHaveBeenCalled();
    expect(mocks.prisma.keywordTag.createMany).not.toHaveBeenCalled();
    expect(mocks.prisma.tag.createMany).not.toHaveBeenCalled();
    expect(mocks.prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("rejects oversized CSV files before reading or writing", async () => {
    const formData = new FormData();
    const file = new File(["x".repeat(maxImportFileBytes + 1)], "keywords.csv", {
      type: "text/csv",
    });
    const text = vi.fn(async () => "keyword\nrank tracker");
    Object.defineProperty(file, "text", { value: text });
    formData.set("file", file);
    formData.set("projectId", PROJECT_PUBLIC_ID);

    await expect(importKeywordsFromCsv(formData)).rejects.toThrow(
      "Keyword import files must be 5 MB or smaller.",
    );
    expect(text).not.toHaveBeenCalled();
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(mocks.prisma.keyword.createMany).not.toHaveBeenCalled();
    expect(mocks.prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("rejects undecodable CSV files with a clear validation message", async () => {
    const formData = new FormData();
    formData.set("file", new File([new Uint8Array([0xff])], "keywords.csv", { type: "text/csv" }));
    formData.set("projectId", PROJECT_PUBLIC_ID);

    await expect(importKeywordsFromCsv(formData)).rejects.toThrow(
      "CSV import files must be UTF-8 encoded. Re-export the file as UTF-8 and try again.",
    );
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(mocks.prisma.keyword.createMany).not.toHaveBeenCalled();
    expect(mocks.prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("rejects replacement characters in decoded CSV strings without writing", async () => {
    await expect(
      importKeywordsFromCsv({ csv: "keyword\nrank � tracker", projectId: PROJECT_PUBLIC_ID }),
    ).resolves.toMatchObject({
      created: 0,
      errors: [
        {
          message:
            "CSV import contains replacement characters (�). Re-export the source as UTF-8 and try again.",
          row: 1,
        },
      ],
      failed: 1,
      parsed: 0,
    });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(mocks.prisma.keyword.createMany).not.toHaveBeenCalled();
  });

  it("rejects 501 received rows before deduplication or writes", async () => {
    const csv = ["keyword", ...Array.from({ length: 501 }, () => "duplicate keyword")].join("\n");

    await expect(importKeywordsFromCsv({ csv, projectId: PROJECT_PUBLIC_ID })).rejects.toThrow(
      "This file contains 501 rows; the maximum is 500. Duplicate rows count toward this limit. Remove duplicates, reduce the file, or split it into multiple imports.",
    );
    expect(mocks.prisma.keyword.findMany).not.toHaveBeenCalled();
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(mocks.prisma.keyword.createMany).not.toHaveBeenCalled();
    expect(mocks.prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("returns validation errors for oversized CSV payload cells without writing", async () => {
    mocks.prisma.keyword.findMany.mockReset();
    mocks.prisma.keyword.findMany.mockResolvedValue([]);

    const result = await importKeywordsFromCsv({
      csv: `keyword\n${"x".repeat(181)}`,
      projectId: PROJECT_PUBLIC_ID,
    });

    expect(result).toMatchObject({
      created: 0,
      errors: [{ message: "String must contain at most 180 character(s)", row: 2 }],
      failed: 1,
      parsed: 0,
      received: 1,
      skipped: 0,
    });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(mocks.prisma.keyword.createMany).not.toHaveBeenCalled();
    expect(mocks.prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("caches resolved import locations per distinct country", async () => {
    mocks.prisma.keyword.findMany.mockReset();
    mocks.prisma.keyword.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        storedKeyword(
          "rank tracker",
          "keyword_1",
          "kw_abcdefghijklmnopqrstuvwx",
          "loc_US",
          "desktop",
          "/rank",
        ),
        storedKeyword(
          "rank checker",
          "keyword_2",
          "kw_bbcdefghijklmnopqrstuvwx",
          "loc_US",
          "mobile",
          "/check",
        ),
      ]);

    const result = await importKeywordsFromCsv({
      csv: [
        "keyword,target_url,tags,country,device",
        "rank tracker,/rank,Core,US,desktop",
        "rank checker,/check,SEO,US,mobile",
      ].join("\n"),
      projectId: PROJECT_PUBLIC_ID,
    });

    expect(result).toMatchObject({ created: 2, errors: [], failed: 0, parsed: 2, received: 2 });
    expect(mocks.resolveKeywordLocation).toHaveBeenCalledTimes(1);
    expect(mocks.resolveKeywordLocation).toHaveBeenCalledWith({
      city: null,
      country: "United States",
      projectId: "project_1",
    });
  });

  it("returns resolver warnings from degraded city imports", async () => {
    mocks.prisma.keyword.findMany.mockReset();
    mocks.prisma.keyword.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        storedKeyword(
          "rank tracker",
          "keyword_1",
          "kw_abcdefghijklmnopqrstuvwx",
          "loc_US",
          "desktop",
          "/rank",
        ),
        storedKeyword(
          "mobile serp",
          "keyword_2",
          "kw_bbcdefghijklmnopqrstuvwx",
          "loc_US",
          "mobile",
          "/mobile",
        ),
      ]);

    const result = await importKeywordsFromCsv({
      csv: [
        "keyword,target_url,tags,country,city,device",
        "rank tracker,/rank,Core,US,Austin,desktop",
        "mobile serp,/mobile,Product,US,Austin,mobile",
      ].join("\n"),
      projectId: PROJECT_PUBLIC_ID,
    });

    expect(result).toMatchObject({
      created: 2,
      warning: 'Could not resolve "Austin" in United States; tracking at country level.',
      warnings: ['Could not resolve "Austin" in United States; tracking at country level.'],
    });
    expect(mocks.resolveKeywordLocation).toHaveBeenCalledTimes(1);
  });

  it.each(["GB", "United Kingdom"])(
    "skips duplicates when existing location has canonical key and CSV country is %s",
    async (country) => {
      mocks.prisma.keyword.findMany.mockReset();
      mocks.prisma.keyword.findMany.mockResolvedValueOnce([
        storedKeyword(
          "rank tracker",
          "keyword_1",
          "kw_abcdefghijklmnopqrstuvwx",
          "loc_GB",
          "desktop",
          "/rank",
        ),
      ]);

      const result = await importKeywordsFromCsv({
        csv: `keyword,target_url,tags,country,device\nrank tracker,/rank,Core,${country},desktop`,
        projectId: PROJECT_PUBLIC_ID,
      });

      expect(result).toMatchObject({ created: 0, errors: [], failed: 0, skipped: 1 });
      expect(mocks.prisma.$transaction).toHaveBeenCalledOnce();
      expect(mocks.prisma.keyword.createMany).not.toHaveBeenCalled();
    },
  );

  it("skips duplicates when CSV default has canonical key and existing location is legacy text", async () => {
    mocks.prisma.keyword.findMany.mockReset();
    mocks.prisma.project.findUnique.mockResolvedValue({
      defaults: { city: null, country: "United Kingdom", device: "desktop", locationKey: "GB" },
      keywords: [],
    });
    mocks.prisma.keyword.findMany.mockResolvedValueOnce([
      storedKeyword(
        "rank tracker",
        "keyword_1",
        "kw_abcdefghijklmnopqrstuvwx",
        "loc_GB",
        "desktop",
        "/rank",
      ),
    ]);

    const result = await importKeywordsFromCsv({
      csv: "keyword,target_url,tags,country,device\nrank tracker,/rank,Core,,desktop",
      projectId: PROJECT_PUBLIC_ID,
    });

    expect(result).toMatchObject({ created: 0, errors: [], failed: 0, skipped: 1 });
    expect(mocks.prisma.$transaction).toHaveBeenCalledOnce();
    expect(mocks.prisma.keyword.createMany).not.toHaveBeenCalled();
  });

  it("exports real XLSX workbooks", async () => {
    mocks.prisma.keyword.findMany.mockReset();
    mocks.prisma.keyword.findMany.mockResolvedValue([
      {
        createdAt: new Date("2026-06-01T00:00:00.000Z"),
        device: "desktop",
        id: "keyword_1",
        location: "United States",
        publicId: "kw_abcdefghijklmnopqrstuvwx",
        rankChecks: [
          {
            checkedAt: new Date("2026-06-20T10:00:00.000Z"),
            position: 3,
            previousPosition: 7,
            rankingUrl: "https://example.com/rank",
          },
        ],
        tags: [{ tag: { name: "SEO" } }],
        targetUrl: "/rank",
        text: "rank tracker",
        updatedAt: new Date("2026-06-21T00:00:00.000Z"),
      },
    ]);

    const result = await exportKeywords({
      columns: { country: true, device: true, tags: true, url: true },
      format: "xlsx",
      projectId: PROJECT_PUBLIC_ID,
      scope: "current",
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      Buffer.from(result.content, "base64") as unknown as Parameters<typeof workbook.xlsx.load>[0],
    );
    const sheet = workbook.getWorksheet("Keywords");

    expect(result).toMatchObject({
      encoding: "base64",
      filename: `bisibility-keywords-${PROJECT_PUBLIC_ID}-current.xlsx`,
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    expect(sheet?.getRow(1).values).toEqual([
      undefined,
      "keyword",
      "position",
      "target_url",
      "tags",
      "country",
      "device",
    ]);
    expect(sheet?.getCell("A2").value).toBe("rank tracker");
    expect(sheet?.getCell("C2").value).toBe("/rank");
  });

  it("caps the plain current-scope export at the shared download keyword limit", async () => {
    mocks.prisma.keyword.findMany.mockReset();
    mocks.prisma.keyword.findMany.mockResolvedValue(
      Array.from({ length: 501 }, (_unused, index) => ({
        createdAt: new Date("2026-06-01T00:00:00.000Z"),
        device: "desktop",
        id: `keyword_${index}`,
        location: "United States",
        publicId: `kw_${index}`,
        rankChecks: [],
        tags: [],
        targetUrl: "/rank",
        text: `keyword ${index}`,
        updatedAt: new Date("2026-06-21T00:00:00.000Z"),
      })),
    );

    await expect(
      exportKeywords({ format: "csv", projectId: PROJECT_PUBLIC_ID, scope: "current" }),
    ).rejects.toThrow("up to 500 keywords");
  });

  it("rejects raw keyword IDs before querying an export", async () => {
    await expect(
      exportKeywords({
        format: "csv",
        keywordIds: ["keyword_1"],
        projectId: PROJECT_PUBLIC_ID,
        scope: "current",
      }),
    ).rejects.toThrow("Keyword not found.");

    expect(mocks.prisma.keyword.findMany).not.toHaveBeenCalled();
  });

  it("filters selected exports exclusively by keyword public ID", async () => {
    mocks.prisma.keyword.findMany.mockReset();
    mocks.prisma.keyword.findMany.mockResolvedValue([]);

    await exportKeywords({
      format: "csv",
      keywordIds: [KEYWORD_PUBLIC_ID],
      projectId: PROJECT_PUBLIC_ID,
      scope: "current",
    });

    expect(mocks.prisma.keyword.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          projectId: "project_1",
          publicId: { in: [KEYWORD_PUBLIC_ID] },
        },
      }),
    );
  });
});
