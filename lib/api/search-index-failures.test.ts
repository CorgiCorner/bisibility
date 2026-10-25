import "./search-index.test-support";

import { propertyQuotaKey } from "@/lib/presence/property-quota";
import { GoogleRequestError } from "@/lib/providers/analytics/google-failure";
import { ProviderAuthError } from "@/lib/providers/auth-error";
import { ProviderHttpError } from "@/lib/providers/failure-class";
import { nextPacificMidnight } from "@/lib/providers/pacific-reset";
import { ProviderRateLimitedError } from "@/lib/providers/rate-limit-error";
import { describe, expect, it, vi } from "vitest";
import { handleApiRequest } from "./router";
import {
  createSearchIndexRequest,
  mocks,
  noGoogleCalls,
  projectId,
} from "./search-index.test-support";

// Provider responses use documented shapes, not captured Google data.
const request = createSearchIndexRequest(handleApiRequest);

describe("Page indexing normalized URLs and provider failures", () => {
  it.each([
    ["empty", ""],
    ["dot", "."],
    ["parent", ".."],
    ["overlong", `https://example.com/${"a".repeat(2030)}`],
    ["relative", "sitemap.xml"],
    ["root relative", "/sitemap.xml"],
    ["scheme relative", "//example.com/sitemap.xml"],
    ["FTP", "ftp://example.com/sitemap.xml"],
    ["data", "data:text/plain,sitemap"],
    ["malformed HTTP", "https://"],
  ])("rejects a %s sitemap path before connection lookup or Google", async (_label, path) => {
    // Supply decoded route params directly: WHATWG URLs normalize dot segments.
    const response = await handleApiRequest(
      new Request(
        `https://example.test/api/v1/projects/${projectId}/search-index/sitemaps/${encodeURIComponent(path)}`,
        {
          headers: { authorization: "Bearer test" },
        },
      ),
      ["projects", projectId, "search-index", "sitemaps", path],
    );
    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toContain("application/problem+json");
    expect(await response.json()).toMatchObject({
      status: 400,
      type: "https://bisibility.com/problems/validation_failed",
    });
    expect(mocks.prisma.providerConnection.findFirst).not.toHaveBeenCalled();
    noGoogleCalls();
  });
  it.each(["hTtP", "HtTpS"])("accepts an absolute %s sitemap URL", async (scheme) => {
    mocks.credentials.mockReturnValue({ login: "sc-domain:example.com" });
    const path = `${scheme}://example.com/sitemap.xml`;
    expect((await request("GET", `sitemaps/${encodeURIComponent(path)}`)).status).toBe(200);
    expect(mocks.provider.getSitemapStatus).toHaveBeenCalledWith(expect.anything(), path);
  });
  it("normalizes bare origins, host case and percent encoding to one persisted URL and call", async () => {
    mocks.credentials.mockReturnValue({ login: "sc-domain:example.com" });
    const url = "https://example.com/";
    mocks.prisma.urlPresence.findMany.mockResolvedValue([
      { url, checkedAt: new Date(), verdict: "FAIL", canonicalOk: true },
    ]);
    const response = await request("POST", "inspections", {
      urls: ["https://example.com", "https://EXAMPLE.com/", "https://%65xample.com/"],
    });
    expect((await response.json()).results).toEqual([
      expect.objectContaining({ url, error: null }),
    ]);
    expect(mocks.provider.inspectUrl).toHaveBeenCalledExactlyOnceWith({
      property: "sc-domain:example.com",
      url,
    });
    expect(mocks.prisma.urlPresence.findMany).toHaveBeenCalledWith({
      where: { projectId: "project-db", url: { in: [url] } },
    });
    expect(mocks.prisma.urlPresence.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ url }) }),
    );
    expect(mocks.emit).toHaveBeenCalledTimes(1);
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({ after: { requested: 1, admitted: 1, refused: 0, repeats: 1 } }),
      mocks.prisma,
    );
  });
  it.each(["daily", "minute", "unknown"] as const)(
    "stops a %s rate-limited batch, exposes reset and scope, and releases only unsent URLs",
    async (scope) => {
      const resetAt = Date.parse("2026-10-25T00:00:00Z");
      mocks.provider.inspectUrl.mockRejectedValueOnce(
        new ProviderRateLimitedError("gsc", { scope, resetAt, source: "provider" }),
      );
      const response = await request("POST", "inspections", {
        urls: [
          "https://example.com/blog/a",
          "https://example.com/blog/b",
          "https://example.com/blog/c",
        ],
      });
      expect(response.status).toBe(200);
      const result = await response.json();
      const error = {
        code: "provider_rate_limited",
        message: "Search Console rate limit reached; no further URLs in this request were sent.",
        reset_at:
          scope === "daily"
            ? nextPacificMidnight(new Date()).toISOString()
            : "2026-10-25T00:00:00.000Z",
        scope,
      };
      expect(result.results.map((row: { error: unknown }) => row.error)).toEqual([
        error,
        error,
        error,
      ]);
      expect(mocks.provider.inspectUrl).toHaveBeenCalledTimes(1);
      expect(mocks.sleep).not.toHaveBeenCalled();
      expect(mocks.startProperty).toHaveBeenCalledExactlyOnceWith(
        propertyQuotaKey("https://example.com/blog/"),
        "fixed",
      );
      expect(mocks.record429).toHaveBeenCalledTimes(1);
      expect(mocks.audit).toHaveBeenLastCalledWith(
        expect.objectContaining({ after: expect.objectContaining({ released: 2 }) }),
      );
      expect(mocks.prisma.urlPresence.upsert).not.toHaveBeenCalled();
    },
  );
  it("releases the entire reservation if session authorization fails before inspection", async () => {
    mocks.provider.createUrlInspectionSession.mockRejectedValueOnce(new ProviderAuthError("gsc"));
    const response = await request("POST", "inspections", {
      urls: ["https://example.com/blog/a", "https://example.com/blog/b"],
    });
    const result = await response.json();
    expect(result.results[0].error).toEqual({
      code: "provider_authorization",
      message: "Provider authorization must be renewed.",
    });
    expect(mocks.provider.inspectUrl).not.toHaveBeenCalled();
    expect(mocks.audit).toHaveBeenLastCalledWith(
      expect.objectContaining({ after: expect.objectContaining({ released: 2 }) }),
    );
  });
  it("counts a sent URL even when storing the result fails", async () => {
    mocks.prisma.urlPresence.upsert.mockRejectedValueOnce(new Error("storage unavailable"));
    const response = await request("POST", "inspections", { urls: ["https://example.com/blog/a"] });
    expect((await response.json()).results[0].error).toEqual({
      code: "inspection_failed",
      message: expect.any(String),
    });
    expect(mocks.audit).toHaveBeenCalledTimes(1);
  });
  it.each([
    [
      "sitemaps",
      "listSitemaps",
      new GoogleRequestError(404),
      404,
      "Search Console property not found.",
    ],
    [
      `sitemaps/${encodeURIComponent("https://example.com/blog/sitemap.xml")}`,
      "getSitemapStatus",
      new GoogleRequestError(404),
      404,
      "Sitemap not found in Search Console for this property.",
    ],
    [
      "sitemaps",
      "listSitemaps",
      new GoogleRequestError(403),
      422,
      "Search Console denied access to this property; check that the connected account can access it.",
    ],
    [
      "sitemaps",
      "listSitemaps",
      new GoogleRequestError(400, "forbidden"),
      422,
      "Search Console denied access to this property; check that the connected account can access it.",
    ],
    [
      "sitemaps",
      "listSitemaps",
      new GoogleRequestError(500),
      502,
      "Search Console request failed.",
    ],
    ["sitemaps", "listSitemaps", new ProviderHttpError(500), 502, "Search Console request failed."],
  ] as const)(
    "maps provider failure at %s (%s, %s) to %s",
    async (tail, method, error, status, detail) => {
      mocks.provider[method].mockRejectedValueOnce(error);
      const response = await request("GET", tail);
      expect(response.status).toBe(status);
      expect(await response.json()).toMatchObject({ detail });
    },
  );
  it("keeps sitemap rate limits on the existing 429 path", async () => {
    mocks.provider.listSitemaps.mockRejectedValueOnce(new ProviderRateLimitedError("gsc"));
    expect((await request("GET", "sitemaps")).status).toBe(429);
  });
});

vi.mock("./router", async (original) =>
  (await import("./response-capture.test-support")).captureRouter(await original()),
);
