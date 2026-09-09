import { marketGridTerm } from "@/lib/keywords/market-grid-model";
import { defaultRankTrackerQueryState } from "@/lib/keywords/rank-tracker-query";
import { describe, expect, it } from "vitest";
import { groupedContractFixture } from "./rank-tracker-grouped-fixtures";
import {
  buildRankTrackerGroupedExplainSql,
  buildRankTrackerGroupedSql,
} from "./rank-tracker-grouped-sql";

function rendered(
  query = { ...defaultRankTrackerQueryState, grouped: true },
  options: Parameters<typeof buildRankTrackerGroupedSql>[2] = {},
) {
  const statement = buildRankTrackerGroupedSql("project_internal", query, options);
  return { sql: statement.sql.replace(/\s+/g, " "), values: statement.values };
}

function boundedRankCheckProjection(sql: string) {
  const cteStart = sql.indexOf("bounded_rank_checks AS");
  const projectionStart = sql.indexOf("SELECT recent.id", cteStart);
  const projectionEnd = sql.indexOf("FROM project_keyword_inputs k", projectionStart);
  return sql.slice(projectionStart, projectionEnd).trim();
}

function currentChecksSql(sql: string) {
  const cteStart = sql.indexOf("current_checks AS");
  const cteEnd = sql.indexOf("), comparable_current", cteStart);
  return sql.slice(cteStart, cteEnd + 1);
}

function directCurrentCheckJoinSql(sql: string) {
  const targetDerivedStart = sql.indexOf("target_derived AS (");
  const joinStart = sql.indexOf("LEFT JOIN LATERAL (", targetDerivedStart);
  const joinEnd = sql.indexOf("LEFT JOIN grouped_tags", joinStart);
  return sql.slice(joinStart, joinEnd).trim();
}

describe("rank tracker grouped SQL", () => {
  it("keeps the contract fixture at forty targets across six JavaScript-normalized terms", () => {
    const targets = groupedContractFixture().targets;
    const knownZero = targets.find(
      (target) =>
        target.keyword === "Beta" &&
        target.location.id === "location_us" &&
        target.device === "Desktop",
    );
    const unknown = targets.find(
      (target) =>
        target.keyword === "Straße" &&
        target.location.id === "location_us" &&
        target.device === "Desktop",
    );

    expect(targets).toHaveLength(40);
    expect([...new Set(targets.map((target) => marketGridTerm(target.keyword)))]).toHaveLength(6);
    expect(knownZero).toMatchObject({ difficulty: 0, difficultyKnown: true });
    expect(unknown).toMatchObject({ difficulty: 0, difficultyKnown: false });
  });

  it("applies target predicates before grouping and term paging", () => {
    const { sql } = rendered({
      ...defaultRankTrackerQueryState,
      grouped: true,
      filters: {
        ...defaultRankTrackerQueryState.filters,
        contains: "rank",
        position: ["11-50"],
        tags: ["Core"],
      },
      search: "docs",
    });

    expect(sql).toContain('m."textNormalized" AS term');
    expect(sql).toContain("k.text ILIKE");
    expect(sql).toContain("d.tags @> ARRAY[");
    expect(sql.indexOf("matched AS MATERIALIZED")).toBeLessThan(
      sql.indexOf("terms AS MATERIALIZED"),
    );
    expect(sql.indexOf("terms AS MATERIALIZED")).toBeLessThan(sql.indexOf("LIMIT ? OFFSET ?"));
  });

  it("excludes archived keywords before grouped selection and facets", () => {
    const { sql } = rendered();

    expect(sql).toContain('WHERE k."projectId" = ? AND k."archivedAt" IS NULL');
    expect(sql.indexOf('k."archivedAt" IS NULL')).toBeLessThan(
      sql.indexOf("project_keywords AS MATERIALIZED"),
    );
  });

  it("computes grouped aggregate sort values with null-preserving difficulty", () => {
    const { sql, values } = rendered({
      ...defaultRankTrackerQueryState,
      grouped: true,
      sort: { direction: "asc", field: "difficulty" },
    });

    expect(sql).toContain("COALESCE(pm.status::text, 'active') AS \"marketStatus\"");
    expect(sql).toContain("k.device::text AS device");
    expect(sql).toContain('SELECT DISTINCT ON (term COLLATE "en-US-x-icu", "canonicalKey" COLLATE');
    expect(sql).toContain('COUNT(*)::int AS "activeMarketCount"');
    expect(sql).toContain('AS "groupedDifficulty"');
    expect(sql).toContain(") IS NULL THEN NULL");
    expect(sql).toContain(") <= 1 THEN (");
    expect(sql).toContain(") * 100");
    expect(values).toEqual(
      expect.arrayContaining([
        "{difficulty}",
        "{keywordDifficulty}",
        "{keyword_difficulty}",
        "{keyword_info,keyword_difficulty}",
        "{keywordInfo,keywordDifficulty}",
        "{metrics,difficulty}",
      ]),
    );
    expect(sql).toContain('CASE WHEN tm."activeMarketCount" = 1 THEN tm.difficulty');
    expect(sql).toContain("0::numeric AS volume");
    expect(sql).not.toContain('MAX(m."lastCheckAt") FILTER (WHERE m."marketStatus" = \'active\')');
  });

  it("carries grouped difficulty through derived keywords without rejoining project inputs", () => {
    const { sql } = rendered({
      ...defaultRankTrackerQueryState,
      grouped: true,
      sort: { direction: "asc", field: "difficulty" },
    });
    const projectKeywords = sql.slice(
      sql.indexOf("project_keywords AS MATERIALIZED"),
      sql.indexOf("project_locations AS"),
    );

    expect(projectKeywords).toContain("SELECT d.* FROM target_derived d");
    expect(projectKeywords).not.toContain("FROM project_keyword_inputs k");
    expect(sql).toContain('metrics."groupedDifficulty"');
    expect(sql).toContain('term, "canonicalKey", "groupedDifficulty" AS difficulty');
  });

  it("uses a per-keyword nested current-check selection while default selection omits deferred derivation", () => {
    const { sql } = rendered();

    const directCurrentCheckJoin = directCurrentCheckJoinSql(sql);
    expect(sql).not.toContain("bounded_rank_checks AS");
    expect(directCurrentCheckJoin).toContain("LEFT JOIN LATERAL (");
    expect(sql).toContain(
      'WHERE rc."keywordId" = k.id AND rc.status <> \'deferred\' ORDER BY rc."checkedAt" DESC, rc.id DESC LIMIT 12',
    );
    expect(directCurrentCheckJoin).toContain(
      'FROM ( SELECT rc.id, rc."keywordId", rc.status, rc."checkedAt", rc."normalizationVersion", rc."requestedDepth", rc.position FROM "rank_checks" rc',
    );
    expect(directCurrentCheckJoin).toContain(
      "WHERE recent.status = 'completed' ORDER BY recent.\"checkedAt\" DESC, recent.id DESC LIMIT 1",
    );
    expect(directCurrentCheckJoin).toContain(
      'WHERE current."normalizationVersion" IS NOT NULL AND current."requestedDepth" IS NOT NULL',
    );
    expect(directCurrentCheckJoin).not.toContain("SELECT DISTINCT ON");
    expect(sql).not.toContain("recent_rank_checks AS (");
    expect(sql).not.toContain(
      'PARTITION BY rc."keywordId" ORDER BY rc."checkedAt" DESC, rc.id DESC',
    );
    expect(sql).not.toContain("current_checks AS (");
    expect(sql).not.toContain("comparable_current AS NOT MATERIALIZED");
    for (const cte of [
      "latest_attempts",
      "baseline_boundaries",
      "rank_baselines",
      "rank_pages",
      "latest_metric_raw",
      "canonical_metrics",
      "canonical_volume",
      "term_metrics",
      "term_volumes",
    ]) {
      expect(sql).not.toContain(`${cte} AS (`);
    }
    expect(sql).toContain("grouped_tags AS (");
    expect(sql).toContain("target_derived AS (");
    expect(sql).toContain("selected_terms AS (");
    expect(sql).not.toContain('rc."rankingUrl"');
    expect(sql).not.toContain("JOIN target_derived d ON d.id = k.id");
    expect(sql).not.toContain("COALESCE(metric.raw");

    const sharedWindowSql = rendered({
      ...defaultRankTrackerQueryState,
      grouped: true,
      sort: { direction: "asc", field: "lastChecked" },
    }).sql;
    expect(sharedWindowSql).toContain("bounded_rank_checks AS MATERIALIZED");

    const searchSql = rendered({
      ...defaultRankTrackerQueryState,
      grouped: true,
      search: "docs",
    }).sql;
    expect(searchSql).toContain('rc."rankingUrl"');
  });

  it("qualifies optional ranking URL projections in direct and shared current-check branches", () => {
    const searchCurrentCheckJoin = directCurrentCheckJoinSql(
      rendered({ ...defaultRankTrackerQueryState, grouped: true, search: "docs" }).sql,
    );
    const rankingPagesSql = rendered({
      ...defaultRankTrackerQueryState,
      grouped: true,
      filters: { ...defaultRankTrackerQueryState.filters, urlChanged: true },
    }).sql;
    const rankingPagesCurrentChecks = currentChecksSql(rankingPagesSql);

    expect(searchCurrentCheckJoin).toContain(
      'current."requestedDepth", current."rankingUrl", current.position',
    );
    expect(searchCurrentCheckJoin).toContain('rc."requestedDepth", rc."rankingUrl", rc.position');
    expect(searchCurrentCheckJoin).toContain(
      'recent."requestedDepth", recent."rankingUrl", recent.position',
    );
    expect(rankingPagesCurrentChecks).toContain(
      '"requestedDepth", position FROM bounded_rank_checks',
    );
    expect(rankingPagesCurrentChecks).not.toContain('recent."rankingUrl"');
    expect(boundedRankCheckProjection(rankingPagesSql)).toBe(
      'SELECT recent.id, recent."keywordId", recent.status, recent."checkedAt", recent."normalizationVersion", recent."requestedDepth", recent."rankingUrl", recent.position',
    );
  });

  it("derives only the metrics and baseline required by the selected SQL sort", () => {
    const volume = rendered({
      ...defaultRankTrackerQueryState,
      grouped: true,
      sort: { direction: "asc", field: "volume" },
    }).sql;
    const change = rendered({
      ...defaultRankTrackerQueryState,
      grouped: true,
      sort: { direction: "asc", field: "change" },
    }).sql;

    expect(volume).toContain("latest_metric_raw AS (");
    expect(volume).toContain("volume_input.value AS volume");
    expect(volume).toContain("canonical_volume AS (");
    expect(volume).not.toContain('AS "groupedDifficulty"');
    expect(change).toContain("baseline_boundaries AS (");
    expect(change).toContain("rank_baselines AS (");
    expect(change).toContain('recent."checkedAt"::date <> current."checkedAt"::date');
    expect(change).toContain('"normalizationVersion" IS DISTINCT FROM');
    expect(change).not.toContain("latest_metric_raw AS (");
  });

  it("returns members in SQL term order with both grouped and target counts", () => {
    const { sql } = rendered();

    expect(sql).toContain("jsonb_build_object('term', term, 'members', members) ORDER BY ordinal");
    expect(sql).toContain('COUNT(*) FROM matched)::int AS "matchedTargetCount"');
    expect(sql).toContain('COUNT(*) FROM terms)::int AS "matchedGroupCount"');
    expect(sql).toContain("'publicId', m.\"publicId\", 'marketStatus', m.\"marketStatus\"");
    expect(sql).toContain('m."publicId" COLLATE "en-US-x-icu"');
    expect(sql).toContain('t."keywordSort" COLLATE "en-US-x-icu" ASC');
  });

  it("loads all candidates without a term page when exact rows are required", () => {
    const { sql } = rendered(
      {
        ...defaultRankTrackerQueryState,
        grouped: true,
        filters: { ...defaultRankTrackerQueryState.filters, change: "up", volMax: 0 },
      },
      { candidatesOnly: true },
    );
    const selectedTerms = sql.slice(
      sql.indexOf("selected_terms AS"),
      sql.indexOf("selected_groups AS"),
    );

    expect(selectedTerms).not.toContain(" LIMIT ");
    expect(sql).not.toContain('d."serpFeatures" @> ARRAY[');
    expect(sql).not.toContain("rank_baselines AS (");
    expect(sql).not.toContain("latest_metric_raw AS (");
    expect(sql).toContain('ORDER BY t."keywordSort" COLLATE "en-US-x-icu" ASC');
  });

  it("provides the production explain statement for index evidence", () => {
    expect(
      buildRankTrackerGroupedExplainSql("project_internal", {
        ...defaultRankTrackerQueryState,
        grouped: true,
      }).sql,
    ).toContain("EXPLAIN (ANALYZE, BUFFERS, VERBOSE)");
  });
});
