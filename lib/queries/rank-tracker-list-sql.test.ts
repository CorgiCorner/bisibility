import { defaultRankTrackerQueryState } from "@/lib/keywords/rank-tracker-query";
import { RANK_TRACKER_SORT_FIELDS } from "@/lib/keywords/rank-tracker-query-types";
import { describe, expect, it } from "vitest";
import { buildRankTrackerListSql } from "./rank-tracker-list-sql";

function rendered(
  query = defaultRankTrackerQueryState,
  options: Parameters<typeof buildRankTrackerListSql>[2] = {},
) {
  const sql = buildRankTrackerListSql("project_internal", query, options);
  return { sql: sql.sql.replace(/\s+/g, " "), values: sql.values };
}

describe("rank tracker list SQL", () => {
  it("keeps every target predicate before ordering and LIMIT", () => {
    const { sql } = rendered({
      ...defaultRankTrackerQueryState,
      filters: {
        change: "down",
        contains: "rank",
        intents: ["commercial"],
        lastCheck: "not_checked",
        position: ["11-50"],
        serp: ["image"],
        tags: ["A", "B"],
        topics: ["Product"],
        urlChanged: true,
        volMax: 20,
        volMin: 10,
        wrongUrl: true,
      },
      lens: { device: "mobile", locationId: "US:en" },
      search: "docs%_\\",
    });
    const matchedWhere = sql.indexOf("WHERE", sql.indexOf("matched AS MATERIALIZED"));
    const selectedLimit = sql.indexOf(" LIMIT ", sql.indexOf("selected AS"));
    expect(sql).toContain('d."positionBaseline" < d.position');
    expect(sql).toContain("d.tags @> ARRAY[");
    expect(sql).toContain('d."serpFeatures" @> ARRAY[');
    expect(sql).not.toContain('regexp_replace(d."rankingUrl"');
    expect(sql).toContain('d."latestAttemptId" IS NULL');
    expect(sql).toContain('d."rankingPages" > 1');
    expect(sql).toContain("ESCAPE '\\'");
    expect(matchedWhere).toBeLessThan(selectedLimit);
  });

  it("keeps exact candidates uncapped until server-side filtering", () => {
    const { sql } = rendered(
      {
        ...defaultRankTrackerQueryState,
        filters: { ...defaultRankTrackerQueryState.filters, wrongUrl: true },
      },
      { candidatesOnly: true },
    );
    const selected = sql.slice(
      sql.indexOf("selected AS"),
      sql.indexOf(") SELECT", sql.indexOf("selected AS")),
    );
    expect(selected).not.toContain(" LIMIT ");
    expect(sql).not.toContain('d."serpFeatures" @> ARRAY[');
  });

  it("uses deterministic limit-plus-one windows for export membership", () => {
    const broad = rendered(defaultRankTrackerQueryState, {
      publicIds: true,
      selectionLimit: 501,
    });
    expect(broad.sql).toContain('SELECT k."publicId" AS id');
    expect(broad.sql).toContain("LIMIT ? OFFSET ?");
    expect(broad.values).toContain(501);
    expect(broad.values).toContain(0);
    const exact = rendered(defaultRankTrackerQueryState, {
      candidatesOnly: true,
      selectionLimit: 250,
      selectionOffset: 500,
    });
    expect(exact.values).toContain(250);
    expect(exact.values).toContain(500);
  });

  it("uses immutable descending keyset windows for exact candidate scans", () => {
    const query = {
      ...defaultRankTrackerQueryState,
      sort: { direction: "asc" as const, field: "clicks" as const },
    };
    const first = rendered(query, { candidateScan: true, selectionLimit: 250 });
    expect(first.sql).toContain('ORDER BY k."createdAt" DESC, k.id DESC LIMIT ?');
    expect(first.sql).not.toContain(" OFFSET ");

    const next = rendered(query, {
      candidateCursor: { createdAt: new Date("2026-08-25T18:30:00.000Z"), id: "internal_cursor" },
      candidateScan: true,
      selectionLimit: 250,
    });
    expect(next.sql).toContain('(k."createdAt", k.id) < (?, ?)');
    expect(next.sql).not.toContain(" OFFSET ");
    expect(next.values).toContain("internal_cursor");
  });

  it("bounds comparisons and URL changes to newest completed checks", () => {
    const { sql } = rendered();
    expect(sql).toContain('ORDER BY rc."checkedAt" DESC, rc.id DESC LIMIT 12');
    expect(sql).toContain("recent.status = 'completed'");
    expect(sql).toContain('COUNT(DISTINCT recent."rankingUrl")');
  });

  it("computes counts and fully filtered facets outside selected pagination", () => {
    const { sql } = rendered();
    expect(sql.indexOf("COUNT(*) FROM matched")).toBeGreaterThan(sql.indexOf("LIMIT"));
    expect(sql).toContain("FROM lens_keywords k CROSS JOIN LATERAL unnest(k.tags) WITH ORDINALITY");
    expect(sql).toContain("('High intent', 1), ('Product', 2), ('Docs', 3)");
    expect(sql).toContain('MIN("sourceOrdinal") ordinal');
    expect(sql).toContain("FROM project_keywords GROUP BY 1,2,3");
  });

  it("supports every closed sort field with stable tie paging", () => {
    for (const field of RANK_TRACKER_SORT_FIELDS) {
      const { sql } = rendered({
        ...defaultRankTrackerQueryState,
        sort: { direction: "desc", field },
      });
      expect(sql).toContain('DESC NULLS LAST, k."createdAt" DESC, k.id DESC');
    }
  });

  it("matches flat client null placement in both directions", () => {
    const ascending = rendered({
      ...defaultRankTrackerQueryState,
      sort: { direction: "asc", field: "clicks" },
    }).sql;
    const descending = rendered({
      ...defaultRankTrackerQueryState,
      sort: { direction: "desc", field: "clicks" },
    }).sql;
    expect(ascending).toContain('ASC NULLS FIRST, k."createdAt" DESC, k.id DESC');
    expect(descending).toContain('DESC NULLS LAST, k."createdAt" DESC, k.id DESC');
  });

  it("derives lens facets in canonical newest-first source order", () => {
    const { sql } = rendered();
    expect(sql).toContain(
      'row_number() OVER (ORDER BY k."createdAt" DESC, k.id DESC) AS "sourceOrdinal"',
    );
    expect(sql).toContain(
      'ORDER BY MIN(occurrences."sourceOrdinal"), MIN(occurrences."tagOrdinal")',
    );
    expect(sql).toContain("jsonb_build_object('label', topic, 'count', count) ORDER BY ordinal");
    expect(sql).toContain("jsonb_build_object('label', intent, 'count', count) ORDER BY ordinal");
  });

  it("passes literal wildcard search as escaped data", () => {
    const { values } = rendered({ ...defaultRankTrackerQueryState, search: "50%_\\" });
    expect(values).toContain("%50\\%\\_\\\\%");
  });
});
