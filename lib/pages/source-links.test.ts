import { appPath } from "@/lib/routing/app-path";
import { describe, expect, it } from "vitest";
import { projectPageColumnConnectHref, projectPageKeywordHref } from "./source-links";

describe("project page source links", () => {
  it("sends an unconnected source to Providers", () => {
    expect(projectPageColumnConnectHref("prj_1", "search_console")).toBe(
      "/app/prj_1/providers?connect=gsc",
    );
    expect(projectPageColumnConnectHref("prj_1", "pagespeed")).toBe(
      "/app/prj_1/providers?connect=pagespeed",
    );
    expect(projectPageColumnConnectHref("prj_1", "sitemap")).toBe(appPath("prj_1", "providers"));
  });

  it("filters Rank Tracker by the page URL", () => {
    expect(projectPageKeywordHref("prj_1", "https://example.com/docs")).toBe(
      "/app/prj_1/rank-tracker?q=https%3A%2F%2Fexample.com%2Fdocs",
    );
  });
});
