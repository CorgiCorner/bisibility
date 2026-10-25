import "./search-index.test-support";

import { dispatchMcpTool } from "@/lib/mcp/tools";
import { documentedSitemap } from "@/lib/providers/analytics/gsc-indexing-fixtures.test-support";
import { ProviderAuthError } from "@/lib/providers/auth-error";
import { describe, expect, it, vi } from "vitest";
import { handleApiRequest } from "./router";
import {
  authenticate,
  createSearchIndexRequest,
  mocks,
  noGoogleCalls,
  project,
  projectId,
} from "./search-index.test-support";

const request = createSearchIndexRequest(handleApiRequest);

describe("Page indexing REST and MCP", () => {
  it("lists and gets the same sitemap through the router with a URL-encoded path", async () => {
    const listed = await request("GET", "sitemaps");
    expect(listed.status).toBe(200);
    const list = await listed.json();
    const detail = await request("GET", `sitemaps/${encodeURIComponent(documentedSitemap.path)}`);
    expect(detail.status).toBe(200);
    expect((await detail.json()).sitemap).toEqual(list.sitemaps[0]);
    expect(list.sitemaps[0].contents).toEqual([{ submitted: 42, type: "web" }]);
    expect(mocks.provider.getSitemapStatus).toHaveBeenCalledWith(
      expect.objectContaining({ login: "https://example.com/blog/" }),
      documentedSitemap.path,
    );
  });
  it("deduplicates, returns and persists the full inspection fields", async () => {
    const url = "https://example.com/blog/page";
    const response = await request("POST", "inspections", { urls: [url, url] });
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toMatchObject({
      url,
      error: null,
      inspection: {
        crawled_as: "MOBILE",
        indexing_state: "INDEXING_ALLOWED",
        rich_results_result: { detected_items: [{ issue_count: 3 }, { issue_count: 0 }] },
      },
    });
    expect(mocks.provider.inspectUrl).toHaveBeenCalledTimes(1);
    expect(mocks.audit).toHaveBeenCalledTimes(1);
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "search_index.inspect",
        after: { requested: 1, admitted: 1, refused: 0, repeats: 0 },
      }),
      mocks.prisma,
    );
    expect(mocks.audit).toHaveBeenCalledBefore(mocks.provider.createUrlInspectionSession);
    expect(mocks.prisma.urlPresence.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          source: "manual",
          indexingState: "INDEXING_ALLOWED",
          canonicalOk: true,
          checkedAt: expect.any(Date),
          coverageState: "Submitted and indexed",
          lastCrawlAt: new Date("2026-10-23T01:00:00Z"),
          projectId: project.id,
          url,
          verdict: "PASS",
        }),
      }),
    );
  });
  it.each([[], Array.from({ length: 11 }, () => "https://example.com/blog/page")])(
    "rejects a batch of %j before Google",
    async (urls) => {
      expect((await request("POST", "inspections", { urls })).status).toBe(400);
      noGoogleCalls();
      expect(mocks.audit).not.toHaveBeenCalled();
    },
  );
  it.each([
    "http://example.com/blog/page",
    "https://other.test/",
    "https://sub.example.com/blog/page",
    "https://example.com/outside",
    "ftp://example.com/blog/page",
    "malformed",
  ])("rejects %s in the whole batch before any Google call", async (url) => {
    const response = await request("POST", "inspections", {
      urls: ["https://example.com/blog/valid", url],
    });
    expect(response.status).toBe(400);
    expect((await response.json()).details.code).toBe("url_outside_property");
    noGoogleCalls();
    expect(mocks.audit).not.toHaveBeenCalled();
  });
  it("rejects outside-property sitemap URLs before Google", async () => {
    expect(
      (await request("GET", `sitemaps/${encodeURIComponent("https://elsewhere.test/sitemap.xml")}`))
        .status,
    ).toBe(400);
    noGoogleCalls();
  });
  it("validates the connected property before listing", async () => {
    mocks.credentials.mockReturnValue({ login: "ftp://example.com/" });
    expect((await request("GET", "sitemaps")).status).toBe(400);
    noGoogleCalls();
  });
  it("accepts domain-property schemes and subdomains", async () => {
    mocks.credentials.mockReturnValue({ apiKey: "test", login: "sc-domain:example.com" });
    expect(
      (
        await request("POST", "inspections", {
          urls: ["http://example.com/", "https://a.example.com/page"],
        })
      ).status,
    ).toBe(200);
    expect(mocks.provider.inspectUrl).toHaveBeenCalledTimes(2);
  });
  it("returns per-URL limit errors for overflow and never creates a Google call for them", async () => {
    mocks.prisma.auditLog.findMany.mockResolvedValue([{ after: { admitted: 2 } }]);
    const response = await request("POST", "inspections", {
      urls: ["https://example.com/blog/a", "https://example.com/blog/b"],
    });
    expect((await response.json()).results).toMatchObject([
      { error: null },
      { inspection: null, error: { code: "inspection_daily_limit" } },
    ]);
    expect(mocks.provider.inspectUrl).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.urlPresence.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.audit).toHaveBeenCalledTimes(1);
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        after: { requested: 2, admitted: 1, refused: 1, repeats: 0 },
      }),
      mocks.prisma,
    );
  });
  it("does not create a session when the whole allowance is exhausted", async () => {
    mocks.prisma.auditLog.findMany.mockResolvedValue([{ after: { admitted: 3 } }]);
    expect(
      (await request("POST", "inspections", { urls: ["https://example.com/blog/a"] })).status,
    ).toBe(200);
    noGoogleCalls();
  });
  it("records repeated URLs in one counts-only request audit", async () => {
    const url = "https://example.com/blog/a";
    const now = new Date();
    mocks.prisma.urlPresence.findMany.mockResolvedValue([
      {
        url,
        checkedAt: now,
        verdict: "PASS",
        canonicalOk: true,
        coverageState: "Submitted and indexed",
        lastCrawlAt: now,
      },
    ]);
    const response = await request("POST", "inspections", {
      urls: [url, "https://example.com/blog/b"],
    });
    expect(response.status).toBe(200);
    expect(mocks.audit).toHaveBeenCalledTimes(1);
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "search_index.inspect",
        after: { requested: 2, admitted: 2, refused: 0, repeats: 1 },
      }),
      mocks.prisma,
    );
    expect(mocks.provider.inspectUrl).toHaveBeenCalledTimes(2);
  });
  it("returns partial failures without leaking provider error bodies", async () => {
    mocks.provider.inspectUrl.mockRejectedValueOnce(new Error("sensitive-provider-body"));
    const response = await request("POST", "inspections", {
      urls: ["https://example.com/blog/a", "https://example.com/blog/b"],
    });
    const result = await response.json();
    expect(result.results).toMatchObject([
      { error: { code: "inspection_failed" } },
      { error: null },
    ]);
    expect(JSON.stringify(result)).not.toContain("sensitive-provider-body");
    expect(mocks.audit).toHaveBeenCalledTimes(1);
  });
  it("keeps an admitted repeat counted when the Google call fails", async () => {
    const url = "https://example.com/blog/a";
    const now = new Date();
    mocks.prisma.project.findUniqueOrThrow.mockResolvedValue({
      ...project,
      defaults: { inspectionDailyLimit: 2 },
    });
    mocks.prisma.urlPresence.count.mockResolvedValue(1);
    mocks.prisma.urlPresence.findMany.mockResolvedValue([
      {
        url,
        checkedAt: now,
        verdict: "PASS",
        canonicalOk: true,
        coverageState: "Submitted and indexed",
        lastCrawlAt: now,
      },
    ]);
    const audits: Array<{ after: unknown }> = [{ after: { admitted: 1 } }];
    mocks.prisma.auditLog.findMany.mockImplementation(async () => audits);
    mocks.audit.mockImplementation(async (input) => {
      audits.push({ after: input.after });
      return { id: "audit-db" };
    });
    mocks.provider.inspectUrl.mockRejectedValueOnce(new Error("provider failed"));
    await request("POST", "inspections", { urls: [url] });
    const retried = await request("POST", "inspections", { urls: [url] });
    expect((await retried.json()).results[0].error.code).toBe("inspection_daily_limit");
    expect(mocks.provider.inspectUrl).toHaveBeenCalledTimes(1);
  });
  it("marks reauthorization and avoids subsequent provider calls", async () => {
    mocks.provider.inspectUrl.mockRejectedValueOnce(new ProviderAuthError("gsc"));
    const response = await request("POST", "inspections", {
      urls: ["https://example.com/blog/a", "https://example.com/blog/b"],
    });
    expect(
      (await response.json()).results.every(
        (row: { error: { code: string } }) => row.error.code === "provider_authorization",
      ),
    ).toBe(true);
    expect(mocks.reauth).toHaveBeenCalledTimes(1);
    expect(mocks.audit).toHaveBeenCalledTimes(2);
    expect(mocks.audit).toHaveBeenLastCalledWith(
      expect.objectContaining({ after: expect.objectContaining({ released: 1 }) }),
    );
    expect(mocks.provider.inspectUrl).toHaveBeenCalledTimes(1);
  });
  it("returns 404 without a connected property", async () => {
    mocks.prisma.providerConnection.findFirst.mockResolvedValue(null);
    expect((await request("GET", "sitemaps")).status).toBe(404);
    noGoogleCalls();
  });
  it("requires write scope for inspection while sitemaps allow read", async () => {
    authenticate(["read"]);
    expect(
      (await request("POST", "inspections", { urls: ["https://example.com/blog/a"] })).status,
    ).toBe(403);
    noGoogleCalls();
    expect((await request("GET", "sitemaps")).status).toBe(200);
  });
  it("enforces project isolation before Google", async () => {
    expect(
      (await request("GET", "sitemaps", undefined, "prj_b00000000000000000000000")).status,
    ).toBe(403);
    noGoogleCalls();
  });
  it("uses the canonical MCP dispatch and returns a tool error for an outside-property batch", async () => {
    const result = await dispatchMcpTool(
      "inspect_search_index_urls",
      { project_id: projectId, urls: ["http://example.com/blog/page"] },
      "test",
    );
    expect(result).toMatchObject({
      ok: false,
      status: 400,
      payload: { details: { code: "url_outside_property" } },
    });
    noGoogleCalls();
  });
});

vi.mock("./router", async (original) =>
  (await import("./response-capture.test-support")).captureRouter(await original()),
);
