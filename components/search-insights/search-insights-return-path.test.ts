import { describe, expect, it } from "vitest";
import {
  searchInsightsCurrentReturnPath,
  searchInsightsPropertyViewPath,
} from "./search-insights-return-path";

describe("searchInsightsCurrentReturnPath", () => {
  it("keeps only property then period in deterministic order", () => {
    expect(
      searchInsightsCurrentReturnPath(
        "/app/prj_1/search-console",
        new URLSearchParams("period=28&property=sc-domain%3Abisibility.com&noise=drop"),
      ),
    ).toBe("/app/prj_1/search-console?property=sc-domain%3Abisibility.com&period=28");
  });

  it("drops OAuth transients and arbitrary parameters", () => {
    expect(
      searchInsightsCurrentReturnPath(
        "/app/prj_1/search-console",
        new URLSearchParams("google=select&connect=ga4&provider=ga4&reason=x&period=90&other=x"),
      ),
    ).toBe("/app/prj_1/search-console?period=90");
  });

  it("keeps a clean active URL clean", () => {
    expect(
      searchInsightsCurrentReturnPath("/app/prj_1/search-console", new URLSearchParams()),
    ).toBe("/app/prj_1/search-console");
  });
  it("preserves an active GA4 selection only when navigating properties", () => {
    expect(
      searchInsightsPropertyViewPath(
        "/app/prj_1/search-console",
        new URLSearchParams(
          "property=sc-domain%3Aexample.com&period=28&google=select&connect=ga4&provider=ga4&reason=drop&other=drop",
        ),
        "sc-domain:archive.example.com",
        true,
      ),
    ).toBe(
      "/app/prj_1/search-console?property=sc-domain%3Aarchive.example.com&period=28&google=select&connect=ga4&provider=ga4",
    );
  });
});
