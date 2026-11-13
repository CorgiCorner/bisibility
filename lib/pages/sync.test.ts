import { beforeEach, describe, expect, it, vi } from "vitest";
import { addManualProjectPages, syncProjectPages } from "./sync";

const mocks = vi.hoisted(() => ({
  executeRaw: vi.fn(),
  findFirst: vi.fn(),
  findMany: vi.fn(),
  queryRaw: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $executeRaw: mocks.executeRaw,
    $queryRaw: mocks.queryRaw,
    project: { findFirst: mocks.findFirst, findMany: mocks.findMany },
  },
}));

const now = new Date("2026-11-10T04:00:00.000Z");
const earlier = new Date("2026-10-01T00:00:00.000Z");
const later = new Date("2026-11-01T00:00:00.000Z");

function sqlText(query: TemplateStringsArray | { sql?: string }) {
  if (Array.isArray(query) || "raw" in query) return String(query.join?.(" ") ?? "");
  return query.sql ?? "";
}

describe("syncProjectPages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findFirst.mockResolvedValue({ domain: "example.com", id: "project_1" });
    mocks.executeRaw.mockResolvedValue(1);
    mocks.queryRaw.mockImplementation((query: TemplateStringsArray, ...values: unknown[]) => {
      const sql = sqlText(query);
      if (sql.includes("search_analytics_page_daily")) {
        return [
          { firstSeenAt: earlier, lastSeenAt: later, page: "https://www.example.com/pricing/" },
        ];
      }
      if (sql.includes("sitemap_snapshots")) {
        return [
          {
            entries: [
              { loc: "https://example.com/pricing" },
              { loc: "https://other.example/nope" },
            ],
            fetchedAt: later,
            sitemapUrl: "https://example.com/sitemap.xml",
          },
        ];
      }
      if (sql.includes("url_presences")) {
        return [{ createdAt: earlier, lastListedAt: earlier, url: "https://example.com/old/" }];
      }
      if (sql.includes("rank_checks")) {
        return [
          {
            checkedAt: later,
            createdAt: earlier,
            expectedUrl: "https://example.com/pricing",
            targetUrl: "https://example.org/foreign",
          },
        ];
      }
      if (sql.includes("ai_tracking_citations")) {
        return [{ firstSeenAt: earlier, lastSeenAt: later, url: "https://blog.example.com/cited" }];
      }
      if (sql.includes("source = 'manual'")) {
        return [
          {
            detail: { addedBy: "user_1" },
            firstSeenAt: earlier,
            lastSeenAt: earlier,
            path: "/manual",
          },
        ];
      }
      if (sql.includes('INSERT INTO "project_pages"')) {
        const paths = values.find(
          (value): value is string[] => Array.isArray(value) && value.includes("/pricing"),
        );
        return (paths ?? []).map((path) => ({ id: `page_${path}`, path }));
      }
      return [];
    });
  });

  it("writes one page per project path and ignores another host", async () => {
    const first = await syncProjectPages("project_1", { now });
    const second = await syncProjectPages("project_1", { now });
    const inserts = mocks.queryRaw.mock.calls.filter((call) =>
      sqlText(call[0]).includes('INSERT INTO "project_pages"'),
    );
    const paths = inserts.map((call) =>
      call.find((value) => Array.isArray(value) && value.includes("/pricing")),
    );

    expect(first).toMatchObject({
      pages: 3,
      projectId: "project_1",
      status: "ok",
      truncated: false,
    });
    expect(second).toEqual(first);
    expect(paths).toEqual([
      ["/manual", "/old", "/pricing"],
      ["/manual", "/old", "/pricing"],
    ]);
    expect(JSON.stringify(inserts)).not.toContain("other.example");
    expect(JSON.stringify(inserts)).not.toContain("example.org");
    expect(sqlText(inserts[0][0])).toContain("LEAST");
    expect(sqlText(inserts[0][0])).toContain("GREATEST");
    expect(
      mocks.executeRaw.mock.calls[0]?.[0] ? sqlText(mocks.executeRaw.mock.calls[0][0]) : "",
    ).toContain("ON CONFLICT");
  });

  it("returns a skipped result instead of throwing when the project has no domain", async () => {
    mocks.findFirst.mockResolvedValue({
      domain: "workspace-abcd.bisibility.cloud",
      id: "project_1",
    });
    await expect(syncProjectPages("project_1", { now })).resolves.toMatchObject({
      reason: "missing_domain",
      status: "skipped",
    });
  });

  it("returns an error result when a read fails", async () => {
    mocks.queryRaw.mockRejectedValue(new Error("database unavailable"));
    await expect(syncProjectPages("project_1", { now })).resolves.toMatchObject({
      error: "database unavailable",
      status: "error",
    });
  });
});

describe("addManualProjectPages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findFirst.mockResolvedValue({ domain: "example.com", id: "project_1" });
    mocks.queryRaw.mockImplementation((query: TemplateStringsArray) => {
      const sql = sqlText(query);
      if (sql.includes("pathHash")) return [{ path: "/pricing" }];
      if (sql.includes('INSERT INTO "project_pages"')) return [{ id: "page_1", path: "/docs" }];
      return [];
    });
    mocks.executeRaw.mockResolvedValue(1);
  });

  it("rejects a foreign host and reports an existing manual page", async () => {
    await expect(
      addManualProjectPages(
        "project_1",
        ["https://example.com/pricing", "https://other.example/nope", "/docs"],
        { id: "user_1" },
        now,
      ),
    ).resolves.toEqual({
      added: 1,
      existing: 1,
      rejected: [
        { line: 2, reason: "This URL is on another site.", value: "https://other.example/nope" },
      ],
    });
  });
});
