import "./search-index.test-support";
import { Prisma } from "@/lib/generated/prisma/client";
import { dispatchMcpTool } from "@/lib/mcp/tools";
import { propertyQuotaKey, readPropertyQuota } from "@/lib/presence/property-quota";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleApiRequest } from "./router";
import {
  authenticate,
  createSearchIndexRequest,
  mocks,
  noGoogleCalls,
  projectId,
} from "./search-index.test-support";

const request = createSearchIndexRequest(handleApiRequest);
const now = new Date("2026-10-24T12:00:00Z");
const row = {
  id: "internal",
  projectId: "project-db",
  url: "https://example.com/blog/a",
  source: "sitemap",
  sitemapUrl: "https://example.com/blog/sitemap.xml",
  verdict: "PASS",
  coverageState: "Submitted and indexed",
  checkedAt: now,
  createdAt: now,
  updatedAt: now,
  lastCrawlAt: now,
  canonicalOk: true,
  googleCanonical: "https://example.com/blog/a",
  userCanonical: null,
  indexingState: "INDEXING_ALLOWED",
  robotsTxtState: "ALLOWED",
  pageFetchState: "SUCCESSFUL",
  crawledAs: "MOBILE",
  referringUrls: [],
  sitemaps: [],
  richResultsSummary: null,
  inspectionResultLink: null,
  inspectionError: null,
  inspectionFailedAt: null,
};

beforeEach(() => {
  mocks.prisma.projectDefaults.findUnique.mockResolvedValue({
    inspectionBudgetMode: "fixed",
    inspectionDailyLimit: 2,
    indexingDiscoveryComplete: true,
    indexingDiscoveryAt: now,
  });
  vi.mocked(readPropertyQuota).mockResolvedValue({
    todayCount: 2,
    last429Kind: null,
    last429At: null,
    nextResetAt: new Date("2026-10-25T07:00:00Z"),
  });
  mocks.prisma.projectDefaults.upsert.mockResolvedValue({
    inspectionBudgetMode: "fixed",
    inspectionDailyLimit: 2,
  });
  mocks.prisma.urlPresenceChange.findMany.mockResolvedValue([
    {
      at: now,
      previous: {
        verdict: "FAIL",
        coverageState: "Not indexed",
        googleCanonical: null,
        indexingState: null,
        robotsTxtState: null,
        pageFetchState: null,
      },
      next: {
        verdict: "PASS",
        coverageState: "Submitted and indexed",
        googleCanonical: row.url,
        indexingState: "INDEXING_ALLOWED",
        robotsTxtState: "ALLOWED",
        pageFetchState: "SUCCESSFUL",
      },
    },
  ]);
});

describe("stored Page indexing REST and MCP", () => {
  it("refuses settings without a connection before any write or audit", async () => {
    mocks.prisma.providerConnection.findFirst.mockResolvedValue(null);
    expect((await request("PATCH", "settings", { budget_mode: "off" })).status).toBe(404);
    expect(mocks.prisma.projectDefaults.upsert).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });
  it("reports groups, freshness, budget and a multi-day remaining estimate without Google", async () => {
    mocks.prisma.urlPresence.findMany.mockResolvedValue([
      row,
      { ...row, url: `${row.url}b`, verdict: "FAIL", coverageState: "Not found (404)" },
      { ...row, url: `${row.url}c`, inspectionError: "inspection_failed" },
      ...Array.from({ length: 5 }, (_, i) => ({ ...row, url: `${row.url}${i}`, checkedAt: null })),
    ]);
    const response = await request("GET", "report");
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result).toMatchObject({
      checked: 3,
      total: 8,
      remaining: 5,
      complete: false,
      estimated_days_remaining: 3,
      budget_mode: "fixed",
      today_count: 2,
    });
    expect(result.groups.map((group: { total: number }) => group.total)).toEqual([1, 1, 1, 5]);
    for (const group of result.groups) expect(group).toHaveProperty("next_reset_at");
    expect(result.groups[0].reasons[0]).toMatchObject({ oldest_result_at: now.toISOString() });
    expect(readPropertyQuota).toHaveBeenCalledWith(
      propertyQuotaKey("https://example.com/blog/"),
      expect.any(Date),
    );
    noGoogleCalls();
  });
  it("reports the oldest result separately for each reason", async () => {
    mocks.prisma.urlPresence.findMany.mockResolvedValue([
      row,
      { ...row, url: `${row.url}b`, checkedAt: new Date("2026-10-21T06:00:00Z") },
      {
        ...row,
        url: `${row.url}c`,
        verdict: "NEUTRAL",
        coverageState: "Crawled - currently not indexed",
        checkedAt: new Date("2026-10-20T06:00:00Z"),
      },
    ]);
    const result = await (await request("GET", "report")).json();
    expect(result.groups[0].reasons).toEqual([
      {
        coverage_state: "Submitted and indexed",
        total: 2,
        oldest_result_at: "2026-10-21T06:00:00.000Z",
      },
    ]);
    expect(result.groups[1].reasons[0].oldest_result_at).toBe("2026-10-20T06:00:00.000Z");
    noGoogleCalls();
  });
  it("filters, paginates and includes bounded history without exposing database IDs", async () => {
    mocks.prisma.urlPresence.findMany.mockResolvedValue([row, { ...row, url: `${row.url}b` }]);
    const response = await request(
      "GET",
      "urls?limit=1&history=true&group=indexed&sitemap=https%3A%2F%2Fexample.com%2Fblog%2Fsitemap.xml&source=sitemap&search=blog",
    );
    const result = await response.json();
    expect(result.meta.next_cursor).toBe(row.url);
    expect(result.data[0].history).toMatchObject({
      complete: true,
      changes: [{ next: { verdict: "PASS" } }],
    });
    expect(result.data[0]).not.toHaveProperty("id");
    expect(result.data[0]).not.toHaveProperty("project_id");
    expect(mocks.prisma.urlPresence.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 2,
        where: expect.objectContaining({
          verdict: "PASS",
          source: "sitemap",
          sitemapUrl: row.sitemapUrl,
        }),
      }),
    );
    noGoogleCalls();
  });
  it("applies tracked change filtering before the page limit and forwards it through MCP", async () => {
    const since = "2026-10-17T12:00:00Z";
    mocks.prisma.urlPresenceChange.findMany.mockResolvedValueOnce([{ url: row.url }]);
    mocks.prisma.urlPresence.findMany.mockResolvedValue([row]);
    const response = await request("GET", `urls?limit=1&changed_since=${since}`);
    expect(response.status).toBe(200);
    expect(mocks.prisma.urlPresenceChange.findMany).toHaveBeenCalledWith({
      where: {
        projectId: "project-db",
        at: { gte: new Date(since) },
        previous: { not: Prisma.JsonNull },
      },
      distinct: ["url"],
      select: { url: true },
    });
    expect(mocks.prisma.urlPresence.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        take: 2,
        where: expect.objectContaining({
          AND: expect.arrayContaining([{ url: { in: [row.url] } }]),
        }),
      }),
    );
    expect((await request("GET", "urls?changed_since=invalid")).status).toBe(400);
    mocks.prisma.urlPresenceChange.findMany.mockResolvedValueOnce([{ url: row.url }]);
    await dispatchMcpTool(
      "list_page_indexing_urls",
      { project_id: projectId, changed_since: since },
      "test",
    );
    expect(mocks.prisma.urlPresenceChange.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: {
          projectId: "project-db",
          at: { gte: new Date(since) },
          previous: { not: Prisma.JsonNull },
        },
      }),
    );
    noGoogleCalls();
  });
  it("rejects invalid filters and settings and enforces write scope", async () => {
    expect((await request("GET", "urls?limit=101")).status).toBe(400);
    expect((await request("PATCH", "settings", { inspection_daily_limit: 2001 })).status).toBe(400);
    expect((await request("PATCH", "settings", {})).status).toBe(400);
    authenticate(["read"]);
    expect((await request("PATCH", "settings", { budget_mode: "off" })).status).toBe(403);
    noGoogleCalls();
  });
  it("updates supported settings and reads the shared counter", async () => {
    const response = await request("PATCH", "settings", {
      inspection_daily_limit: 2000,
      budget_mode: "fixed",
    });
    expect(response.status).toBe(200);
    expect(mocks.prisma.projectDefaults.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { inspectionBudgetMode: "fixed", inspectionDailyLimit: 2000 },
      }),
    );
    expect(mocks.prisma.providerConnection.findFirst).toHaveBeenCalledTimes(1);
    expect(await response.json()).toMatchObject({
      today_count: 2,
      last429_kind: null,
      available_modes: expect.arrayContaining(["off", "fixed"]),
    });
    noGoogleCalls();
  });
  it("dispatches all four canonical names through the real router", async () => {
    for (const name of [
      "get_page_indexing_report",
      "list_page_indexing_urls",
      "get_page_indexing_settings",
      "update_page_indexing_settings",
    ] as const) {
      const result = await dispatchMcpTool(
        name,
        { project_id: projectId, ...(name.startsWith("update") ? { budget_mode: "off" } : {}) },
        "test",
      );
      expect(result).toBeDefined();
    }
    noGoogleCalls();
  });
});

vi.mock("./router", async (original) =>
  (await import("./response-capture.test-support")).captureRouter(await original()),
);
