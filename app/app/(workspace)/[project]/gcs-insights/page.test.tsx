import { redirect } from "@/tests/next-navigation";
import { describe, expect, it } from "vitest";
import LegacySearchConsolePage from "./page";

describe("legacy Search Console route", () => {
  it("redirects bookmarked links to the canonical route and preserves query parameters", async () => {
    await LegacySearchConsolePage({
      params: Promise.resolve({ project: "prj_example" }),
      searchParams: Promise.resolve({ period: "28", property: "sc-domain:example.com" }),
    });

    expect(redirect).toHaveBeenCalledWith(
      "/app/prj_example/search-console?period=28&property=sc-domain%3Aexample.com",
    );
  });
});
