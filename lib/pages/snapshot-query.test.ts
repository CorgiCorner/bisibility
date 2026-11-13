import { describe, expect, it } from "vitest";
import { existingVsNewQueries } from "./snapshot-query";

const input = {
  from: new Date("2026-10-01T00:00:00.000Z"),
  ga4Property: null as string | null,
  gscProperty: "sc-domain:example.com",
  host: "example.com",
  metric: "clicks" as const,
  projectId: "project_1",
  sessions: "none" as const,
  to: new Date("2026-10-21T00:00:00.000Z"),
};

describe("existing vs new SQL", () => {
  it("joins daily clicks to snapshot membership through the canonical path", () => {
    const daily = existingVsNewQueries(input).daily;
    expect(daily.sql).toContain("page_snapshots");
    expect(daily.sql).toContain("page_snapshot_pages");
    expect(daily.sql).toContain("'in_snapshot'");
    expect(daily.sql).not.toContain("= 'existing'");
    expect(daily.sql).toContain("search_analytics_page_daily");
    expect(daily.sql).toContain("regexp_match");
    expect(daily.values).toContain("example.com");
    expect(daily.sql).not.toContain("example.com");
    expect(daily.sql).not.toContain("469");
  });

  it("does not read a daily table when that metric's source is missing", () => {
    const daily = existingVsNewQueries({ ...input, gscProperty: null }).daily;
    expect(daily.sql).toContain("WHERE false");
    expect(daily.sql).not.toContain("search_analytics_page_daily");
  });

  it("uses the latest rolling window for analytics snapshots instead of summing them", () => {
    const daily = existingVsNewQueries({
      ...input,
      gscProperty: null,
      metric: "sessions",
      sessions: "plausible",
    }).daily;
    expect(daily.sql).toContain("page_traffic_snapshots");
    expect(daily.sql).toContain("DISTINCT ON");
    expect(daily.sql).not.toContain("organic_sessions_page_daily");
  });

  it("sums enabled conversion goals by day when that metric is selected", () => {
    const ready = existingVsNewQueries({
      ...input,
      conversionSource: "plausible",
      gscProperty: null,
      metric: "conversions",
    }).daily;
    expect(ready.sql).toContain("conversion_daily");
    expect(ready.sql).toContain("conversion_goals");
    expect(ready.values).toContain("plausible");
    const missing = existingVsNewQueries({
      ...input,
      gscProperty: null,
      metric: "conversions",
    }).daily;
    expect(missing.sql).toContain("WHERE false");
    expect(missing.sql).not.toContain("conversion_daily");
  });
});
