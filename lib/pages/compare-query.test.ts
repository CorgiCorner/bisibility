import { describe, expect, it } from "vitest";
import { compareGroupQueries } from "./compare-query";

const input = {
  changedTagId: "tag_changed",
  from: new Date("2026-10-01T00:00:00.000Z"),
  ga4Property: null as string | null,
  gscProperty: "sc-domain:example.com",
  host: "example.com",
  metric: "clicks" as const,
  projectId: "project_1",
  to: new Date("2026-10-28T00:00:00.000Z"),
  unchangedTagId: "tag_control",
};

describe("compare SQL", () => {
  it("sums Search Console clicks through the canonical path and drops shared pages", () => {
    const daily = compareGroupQueries(input).daily;
    expect(daily.sql).toContain("page_tags");
    expect(daily.sql).toContain("search_analytics_page_daily");
    expect(daily.sql).toContain("COUNT(DISTINCT tag_id) > 1");
    expect(daily.sql).toContain("regexp_match");
    expect(daily.values).toContain("example.com");
    expect(daily.values).toContain("tag_changed");
    expect(daily.values).toContain("tag_control");
    expect(daily.sql).not.toContain("example.com");
    expect(daily.sql).not.toContain("tag_changed");
  });

  it("reads impressions and daily sessions from their own tables", () => {
    const impressions = compareGroupQueries({ ...input, metric: "impressions" }).daily;
    expect(impressions.sql).toContain("daily.impressions");
    const sessions = compareGroupQueries({
      ...input,
      ga4Property: "properties/1",
      gscProperty: null,
      metric: "sessions",
    }).daily;
    expect(sessions.sql).toContain("organic_sessions_page_daily");
    expect(sessions.sql).not.toContain("search_analytics_page_daily");
  });

  it("does not read a daily table when that source is missing", () => {
    const daily = compareGroupQueries({ ...input, gscProperty: null }).daily;
    expect(daily.sql).toContain("WHERE false");
    expect(daily.sql).not.toContain("search_analytics_page_daily");
  });
});
