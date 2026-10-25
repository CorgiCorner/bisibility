import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gscAnalyticsProvider } from "./gsc";
import { documentedInspection, documentedSitemap } from "./gsc-indexing-fixtures.test-support";
import { normalizeGscInspection } from "./gsc-inspection-result";
import { GscPropertyUrlError } from "./gsc-property-membership";

const creds = { apiKey: "test-refresh", login: "sc-domain:example.com" };
describe("Page indexing provider responses", () => {
  beforeEach(() => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "client");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "secret");
    vi.stubEnv("BISIBILITY_PROVIDER_RATE_LIMIT_DISABLED", "1");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) => {
        if (String(url).includes("oauth2.googleapis.com"))
          return Response.json({ access_token: "test-access" });
        if (String(url).endsWith("/sitemaps"))
          return Response.json({ sitemap: [documentedSitemap] });
        if (String(url).includes("/sitemaps/")) return Response.json(documentedSitemap);
        return Response.json(documentedInspection);
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it.each(["sc-domain:example.com", "https://example.com/blog/"])(
    "normalizes list and get identically for %s and drops indexed",
    async (login) => {
      const [listed] = await gscAnalyticsProvider.listSitemaps({ ...creds, login });
      const detail = await gscAnalyticsProvider.getSitemapStatus(
        { ...creds, login },
        documentedSitemap.path,
      );
      expect(listed).toEqual(detail);
      expect(detail).toEqual({
        ...documentedSitemap,
        errors: 2,
        warnings: 3,
        contents: [{ type: "web", submitted: 42 }],
      });
      expect(detail.contents[0]).not.toHaveProperty("indexed");
      expect(vi.mocked(fetch).mock.calls.map(([url]) => String(url))).toContain(
        `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(login)}/sitemaps/${encodeURIComponent(documentedSitemap.path)}`,
      );
    },
  );
  it("returns an empty list for an absent sitemap array", async () => {
    vi.mocked(fetch).mockImplementation(async (url) =>
      Response.json(String(url).includes("oauth2") ? { access_token: "test" } : {}),
    );
    await expect(gscAnalyticsProvider.listSitemaps(creds)).resolves.toEqual([]);
  });
  it("preserves every inspection field and summarizes issues by item type and severity", async () => {
    const result = await gscAnalyticsProvider.inspectUrl(creds, {
      property: creds.login,
      url: "https://example.com/blog/page",
    });
    expect(result).toMatchObject(documentedInspection.inspectionResult.indexStatusResult);
    expect(result.inspectionResultLink).toBe(
      documentedInspection.inspectionResult.inspectionResultLink,
    );
    expect(result.richResultsResult).toEqual({
      verdict: "FAIL",
      detectedItems: [
        {
          richResultType: "Product",
          itemCount: 2,
          issueCount: 3,
          issues: [
            { severity: "ERROR", count: 2 },
            { severity: "WARNING", count: 1 },
          ],
        },
        { richResultType: "Breadcrumbs", itemCount: 1, issueCount: 0, issues: [] },
      ],
    });
    expect(result).not.toHaveProperty("mobileUsabilityResult");
  });
  it("normalizes absent fields and invalid crawl dates without fabricating results", () => {
    expect(normalizeGscInspection({})).toMatchObject({
      verdict: null,
      referringUrls: [],
      sitemap: [],
      richResultsResult: null,
      lastCrawlAt: null,
    });
    expect(
      normalizeGscInspection({
        inspectionResult: { indexStatusResult: { lastCrawlTime: "invalid" } },
      }).lastCrawlAt,
    ).toBeNull();
  });
  it.each(["get", "inspect", "list"])(
    "rejects invalid %s membership before even refreshing a token",
    async (operation) => {
      const result =
        operation === "get"
          ? gscAnalyticsProvider.getSitemapStatus(creds, "https://evil.test/sitemap.xml")
          : operation === "inspect"
            ? gscAnalyticsProvider.inspectUrl(creds, {
                property: creds.login,
                url: "https://evil.test/",
              })
            : gscAnalyticsProvider.listSitemaps({ ...creds, login: "ftp://example.com/" });
      await expect(result).rejects.toThrow();
      expect(fetch).not.toHaveBeenCalled();
    },
  );
  it("rejects a URL-prefix mismatch with a typed error and zero client calls", async () => {
    await expect(
      gscAnalyticsProvider.getSitemapStatus(
        { ...creds, login: "https://example.com/blog/" },
        "http://example.com/blog/sitemap.xml",
      ),
    ).rejects.toBeInstanceOf(GscPropertyUrlError);
    expect(fetch).not.toHaveBeenCalled();
  });
});
