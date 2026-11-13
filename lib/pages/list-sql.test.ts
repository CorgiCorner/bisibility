import { pageIndexingGroup } from "@/lib/search-index/report";
import { describe, expect, it } from "vitest";
import { projectPagesListQuery, sqlIndexGroup } from "./list-sql";

const period = {
  from: new Date("2026-10-01T00:00:00.000Z"),
  to: new Date("2026-10-31T00:00:00.000Z"),
};

function query(overrides: Partial<Parameters<typeof projectPagesListQuery>[0]> = {}) {
  return projectPagesListQuery({
    from: period.from,
    ga4Property: null,
    gscProperty: null,
    host: "example.com",
    page: 2,
    pageSize: 25,
    projectId: "project_1",
    sessions: "none",
    sort: { by: "clicks", dir: "desc" },
    to: period.to,
    ...overrides,
  });
}

describe("project page list SQL", () => {
  it("sorts and paginates in SQL for the whole project", () => {
    const rows = query().rows;
    expect(rows.sql).toContain("ORDER BY");
    expect(rows.sql).toContain("DESC NULLS LAST");
    expect(rows.sql).toContain("LIMIT");
    expect(rows.sql).toContain("OFFSET");
    expect(rows.values.filter((value) => value === 25)).toHaveLength(2);
    expect(rows.sql).not.toContain("example.com");
    expect(rows.values).toContain("example.com");
  });

  it("leaves search console and sessions out of the query when they are not connected", () => {
    const rows = query().rows;
    expect(rows.sql).not.toContain("search_analytics_page_daily");
    expect(rows.sql).not.toContain("conversion_daily");
    expect(rows.sql).not.toContain("organic_sessions_page_daily");
    expect(rows.sql).toContain("WHERE false");
  });

  it("joins an active Search Console property through the canonical path expression", () => {
    const rows = query({ gscProperty: "sc-domain:example.com" }).rows;
    expect(rows.sql).toContain("search_analytics_page_daily");
    expect(rows.sql).toContain("regexp_match");
    expect(rows.values).toContain("sc-domain:example.com");
  });

  it("filters the list to one stored Google coverage reason", () => {
    const reason = "Excluded by 'noindex' tag";
    const rows = query({ coverageState: reason, indexGroup: "not_indexed" }).rows;
    expect(rows.sql).toContain('presence."coverageState"');
    expect(rows.sql).not.toContain(reason);
    expect(rows.values).toContain(reason);
    expect(rows.values).toContain("not_indexed");
  });

  it("keeps a tag filter in the shared from clause", () => {
    const rows = query({ tagId: "tag_docs" }).rows;
    expect(rows.sql).toContain('FROM "page_tags"');
    expect(rows.sql).toContain('tag_row."publicId"');
    expect(rows.values).toContain("tag_docs");
    expect(query().rows.sql).not.toContain('FROM "page_tags"');
  });

  it("keeps status counts independent of the status filter", () => {
    const counts = query({ status: "removed" }).counts;
    expect(counts.sql).toContain("page_snapshots");
    expect(counts.sql).toContain("'in_snapshot'");
    expect(counts.sql).toContain("'redirected'");
    expect(query({ status: "new" }).rows.sql).toContain('filtered."statusKind"');
    expect(query().counts.sql).not.toContain('filtered."statusKind"');
  });

  it("keeps sitemap tab counts independent of the sitemap filter", () => {
    const counts = query({ sitemapState: "not_listed" }).counts;
    expect(counts.sql).toContain("COUNT(*) FILTER (WHERE NOT COALESCE(sitemap.listed, false))");
    expect(counts.sql).not.toMatch(/AND NOT COALESCE\(sitemap\.listed, false\)/);
    expect(query({ sitemapState: "not_listed" }).rows.sql).toContain("NOT filtered.listed");
  });

  it("filters mobile Core Web Vitals without turning a missing row into a zero", () => {
    const rows = query({ cwv: "pass" }).rows;
    expect(rows.sql).toContain("page_vitals");
    expect(rows.sql).toContain("vitals.strategy = 'mobile'");
    expect(rows.values).toContain("good");
    expect(query({ cwv: "missing" }).rows.sql).toContain('filtered."vitalsStatus" IS NULL');
  });

  it("uses the same index group as page indexing, and null when no presence row exists", () => {
    const checked = new Date("2026-10-02T00:00:00.000Z");
    const rows = [
      { checkedAt: checked, id: "presence_1", inspectionError: "timeout", verdict: "PASS" },
      { checkedAt: null, id: "presence_2", inspectionError: null, verdict: null },
      { checkedAt: checked, id: "presence_3", inspectionError: null, verdict: "PASS" },
      { checkedAt: checked, id: "presence_4", inspectionError: null, verdict: "FAIL" },
    ];
    for (const row of rows) {
      expect(sqlIndexGroup(row)).toBe(pageIndexingGroup(row));
    }
    expect(
      sqlIndexGroup({ checkedAt: null, id: null, inspectionError: null, verdict: null }),
    ).toBeNull();
    expect(pageIndexingGroup({ checkedAt: null, inspectionError: null, verdict: null })).toBe(
      "not_checked",
    );
    expect(query().rows.sql).toContain("WHEN presence.id IS NULL THEN NULL");
  });

  it("sorts conversions in SQL and leaves a missing page null", () => {
    const rows = query({
      conversionSource: "ga4",
      sort: { by: "conversions", dir: "desc" },
    }).rows;
    expect(rows.sql).toContain("conversion_daily");
    expect(rows.sql).toContain('conversions.value AS "conversionValue"');
    expect(rows.sql).toContain('filtered."conversionValue" DESC NULLS LAST');
    expect(rows.values).toContain("ga4");
    expect(rows.sql).not.toContain("'ga4'");
  });
});
