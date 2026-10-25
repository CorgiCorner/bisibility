// documented shape, not captured. Search Console v1 UrlInspectionResult and Webmasters v3 Sitemap.
// https://developers.google.com/webmaster-tools/v1/urlInspection.index/UrlInspectionResult
// https://developers.google.com/webmaster-tools/v1/sitemaps
export const documentedSitemap = {
  path: "https://example.com/blog/sitemap.xml",
  type: "sitemap",
  isSitemapsIndex: true,
  isPending: false,
  errors: "2",
  warnings: "3",
  lastSubmitted: "2026-10-23T00:00:00Z",
  lastDownloaded: "2026-10-23T01:00:00Z",
  contents: [{ type: "web", submitted: "42", indexed: "999" }],
};
export const documentedInspection = {
  inspectionResult: {
    inspectionResultLink:
      "https://search.google.com/search-console/inspect?resource_id=sc-domain%3Aexample.com",
    indexStatusResult: {
      verdict: "PASS",
      coverageState: "Submitted and indexed",
      robotsTxtState: "ALLOWED",
      indexingState: "INDEXING_ALLOWED",
      lastCrawlTime: "2026-10-23T01:00:00Z",
      pageFetchState: "SUCCESSFUL",
      googleCanonical: "https://example.com/blog/page",
      userCanonical: "https://example.com/blog/page",
      crawledAs: "MOBILE",
      referringUrls: ["https://example.com/"],
      sitemap: ["https://example.com/blog/sitemap.xml"],
    },
    richResultsResult: {
      verdict: "FAIL",
      detectedItems: [
        {
          richResultType: "Product",
          items: [
            {
              name: "Example",
              issues: [
                { severity: "ERROR", issueMessage: "Missing name" },
                { severity: "WARNING", issueMessage: "Missing image" },
              ],
            },
            { name: "Other", issues: [{ severity: "ERROR", issueMessage: "Missing name" }] },
          ],
        },
        { richResultType: "Breadcrumbs", items: [{ name: "Breadcrumbs" }] },
      ],
    },
    mobileUsabilityResult: { verdict: "PASS" },
  },
};
