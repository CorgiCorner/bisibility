import { nextPacificMidnight } from "@/lib/providers/pacific-reset";
import { describe, expect, it } from "vitest";
import { groupPercentages, searchConsoleTab, searchConsoleTabHref } from "./ui-model";

describe("Page indexing presentation", () => {
  it.each([
    [undefined, "performance"],
    ["unknown", "performance"],
    ["page-indexing", "page-indexing"],
    [["page-indexing"], "page-indexing"],
    ["sitemaps", "sitemaps"],
    [["sitemaps"], "sitemaps"],
  ] as const)("routes %s", (value, expected) => {
    expect(searchConsoleTab(value as string | string[] | undefined)).toBe(expected);
  });
  it("preserves the Performance query and removes the tab on return", () => {
    expect(
      searchConsoleTabHref(
        "/app/p/search-console",
        "property=abc&period=28d&tab=page-indexing",
        "performance",
      ),
    ).toBe("/app/p/search-console?property=abc&period=28d");
    expect(searchConsoleTabHref("/app/p/search-console", "period=28d", "page-indexing")).toBe(
      "/app/p/search-console?period=28d&tab=page-indexing",
    );
    expect(
      searchConsoleTabHref("/app/p/search-console", "period=28d&tab=page-indexing", "sitemaps"),
    ).toBe("/app/p/search-console?period=28d&tab=sitemaps");
  });
  it("rounds with the largest remainder, retaining small groups", () => {
    expect(groupPercentages([612, 248, 4, 376])).toEqual(["50%", "20%", "<1%", "30%"]);
    expect(groupPercentages([1, 1, 1])).toEqual(["34%", "33%", "33%"]);
    expect(groupPercentages([0, 0])).toEqual(["0%", "0%"]);
  });
  it.each([
    ["2026-10-22T12:00:00Z", "09:00"],
    ["2026-10-26T12:00:00Z", "08:00"],
  ])("computes Pacific reset in Warsaw for %s", (now, time) => {
    const reset = nextPacificMidnight(new Date(now));
    expect(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/Warsaw",
        hour: "2-digit",
        minute: "2-digit",
      }).format(reset),
    ).toBe(time);
  });
});
