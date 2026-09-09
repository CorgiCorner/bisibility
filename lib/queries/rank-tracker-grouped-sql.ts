import { Prisma } from "@/lib/generated/prisma/client";
import type { RankTrackerQueryState } from "@/lib/keywords/rank-tracker-query-types";
import {
  type GroupedDerivedRequirements,
  groupedDerivedKeywordCtes,
} from "./rank-tracker-grouped-derived";
import { groupedRankTrackerOrderBy } from "./rank-tracker-grouped-sort";
import { contentPredicate, lensPredicate } from "./rank-tracker-list-filters";
import { rankTrackerLocationsSql } from "./rank-tracker-locations-sql";

type GroupedSqlOptions = { candidatesOnly?: boolean };

function hasVolumeFilter(query: RankTrackerQueryState) {
  return query.filters.volMin > 0 || query.filters.volMax < 50;
}

function groupedRequirements(
  query: RankTrackerQueryState,
  candidatesOnly: boolean,
): GroupedDerivedRequirements {
  const needsSqlSort = !candidatesOnly;
  const lastCheck = query.filters.lastCheck !== "any";
  return {
    baseline: needsSqlSort && (query.filters.change !== "any" || query.sort.field === "change"),
    hasRankData: needsSqlSort && ["change", "position", "sparkline"].includes(query.sort.field),
    lastCheck: lastCheck
      ? "full"
      : needsSqlSort && query.sort.field === "lastChecked"
        ? "timestamp"
        : "none",
    metrics: {
      difficulty: needsSqlSort && query.sort.field === "difficulty",
      volume: needsSqlSort && (hasVolumeFilter(query) || query.sort.field === "volume"),
    },
    rankingPages: needsSqlSort && query.filters.urlChanged,
    rankingUrl: needsSqlSort && Boolean(query.search.trim()),
    serpFeatures: needsSqlSort && query.filters.serp.length > 0,
  };
}

function contentColumns(query: RankTrackerQueryState, candidatesOnly: boolean) {
  const columns: Prisma.Sql[] = [];
  const filters = query.filters;
  if (filters.position.length) columns.push(Prisma.sql`k.position`);
  if (!candidatesOnly && filters.change !== "any") {
    columns.push(Prisma.sql`k."positionBaseline"`);
  }
  if (!candidatesOnly) {
    columns.push(hasVolumeFilter(query) ? Prisma.sql`k.volume` : Prisma.sql`0::numeric AS volume`);
  }
  if (filters.tags.length || (!candidatesOnly && query.search.trim())) {
    columns.push(Prisma.sql`k.tags`);
  }
  if (!candidatesOnly && filters.serp.length) columns.push(Prisma.sql`k."serpFeatures"`);
  if (filters.lastCheck !== "any") {
    columns.push(Prisma.sql`k."latestAttemptId"`, Prisma.sql`k."lastCheckStatus"`);
  }
  if (!candidatesOnly && filters.urlChanged) columns.push(Prisma.sql`k."rankingPages"`);
  if (!candidatesOnly && query.search.trim()) columns.push(Prisma.sql`k."rankingUrl"`);
  return columns.length
    ? Prisma.sql`CROSS JOIN LATERAL (SELECT ${Prisma.join(columns, ", ")}) d`
    : Prisma.empty;
}

function lensColumns(requirements: GroupedDerivedRequirements) {
  const latestAttempt =
    requirements.lastCheck === "full"
      ? Prisma.sql`, k."latestAttemptId", k."lastCheckStatus"`
      : Prisma.empty;
  const lastCheckAt =
    requirements.lastCheck !== "none" ? Prisma.sql`, k."lastCheckAt"` : Prisma.empty;
  return Prisma.sql`k.id, k."publicId", k.text, k."textNormalized", k.device, k.topic, k.intent,
    k."canonicalKey", k."displayName", k."locationHl", k."marketStatus", k."sourceOrdinal",
    k.position, k.tags${requirements.rankingUrl ? Prisma.sql`, k."targetUrl", k."rankingUrl"` : Prisma.empty}${requirements.baseline ? Prisma.sql`, k."positionBaseline"` : Prisma.empty}${latestAttempt}${lastCheckAt}${requirements.rankingPages ? Prisma.sql`, k."rankingPages"` : Prisma.empty}${requirements.serpFeatures ? Prisma.sql`, k."serpFeatures"` : Prisma.empty}${requirements.metrics.volume ? Prisma.sql`, k.volume` : Prisma.empty}${requirements.metrics.difficulty ? Prisma.sql`, k."groupedDifficulty"` : Prisma.empty}${requirements.hasRankData ? Prisma.sql`, k."hasRankData"` : Prisma.empty}`;
}

function termCtes(sort: RankTrackerQueryState["sort"]) {
  const position = Prisma.sql`MIN(m.position) FILTER (WHERE m."marketStatus" = 'active' AND m."hasRankData")`;
  if (sort.field === "position") {
    return Prisma.sql`, terms AS MATERIALIZED (
      SELECT m.term, MIN(m.text COLLATE "en-US-x-icu") AS "keywordSort", ${position} AS "positionSort"
      FROM matched_terms m GROUP BY m.term
    )`;
  }
  if (sort.field === "sparkline") {
    return Prisma.sql`, terms AS MATERIALIZED (
      SELECT m.term, MIN(m.text COLLATE "en-US-x-icu") AS "keywordSort", ${position} AS "sparklineSort"
      FROM matched_terms m GROUP BY m.term
    )`;
  }
  if (sort.field === "change") {
    return Prisma.sql`, terms AS MATERIALIZED (
      SELECT m.term, MIN(m.text COLLATE "en-US-x-icu") AS "keywordSort",
        MIN(m."positionBaseline") FILTER (WHERE m."marketStatus" = 'active') -
          MIN(m.position) FILTER (WHERE m."marketStatus" = 'active' AND m."hasRankData") AS "changeSort"
      FROM matched_terms m GROUP BY m.term
    )`;
  }
  if (sort.field === "volume") {
    return Prisma.sql`, canonical_volume AS (
      SELECT DISTINCT ON (term COLLATE "en-US-x-icu", "canonicalKey" COLLATE "en-US-x-icu")
        term, "canonicalKey", volume
      FROM matched_terms WHERE "marketStatus" = 'active' AND volume IS NOT NULL
      ORDER BY term COLLATE "en-US-x-icu", "canonicalKey" COLLATE "en-US-x-icu",
        "displayName" COLLATE "en-US-x-icu", "locationHl" COLLATE "en-US-x-icu",
        device COLLATE "en-US-x-icu", "publicId" COLLATE "en-US-x-icu"
    ), term_volumes AS (
      SELECT term, SUM(volume) AS volume FROM canonical_volume GROUP BY term
    ), terms AS MATERIALIZED (
      SELECT m.term, MIN(m.text COLLATE "en-US-x-icu") AS "keywordSort", tv.volume AS "volumeSort"
      FROM matched_terms m LEFT JOIN term_volumes tv ON tv.term = m.term
      GROUP BY m.term, tv.volume
    )`;
  }
  if (sort.field === "difficulty") {
    return Prisma.sql`, canonical_metrics AS (
      SELECT DISTINCT ON (term COLLATE "en-US-x-icu", "canonicalKey" COLLATE "en-US-x-icu")
        term, "canonicalKey", "groupedDifficulty" AS difficulty
      FROM matched_terms WHERE "marketStatus" = 'active'
      ORDER BY term COLLATE "en-US-x-icu", "canonicalKey" COLLATE "en-US-x-icu",
        "displayName" COLLATE "en-US-x-icu", "locationHl" COLLATE "en-US-x-icu",
        device COLLATE "en-US-x-icu", "publicId" COLLATE "en-US-x-icu"
    ), term_metrics AS (
      SELECT term, COUNT(*)::int AS "activeMarketCount", MIN(difficulty) AS difficulty
      FROM canonical_metrics GROUP BY term
    ), terms AS MATERIALIZED (
      SELECT m.term, MIN(m.text COLLATE "en-US-x-icu") AS "keywordSort",
        CASE WHEN tm."activeMarketCount" = 1 THEN tm.difficulty END AS "difficultySort"
      FROM matched_terms m LEFT JOIN term_metrics tm ON tm.term = m.term
      GROUP BY m.term, tm."activeMarketCount", tm.difficulty
    )`;
  }
  if (sort.field === "lastChecked") {
    return Prisma.sql`, terms AS MATERIALIZED (
      SELECT m.term, MIN(m.text COLLATE "en-US-x-icu") AS "keywordSort",
        MAX(m."lastCheckAt") FILTER (WHERE m."marketStatus" = 'active') AS "lastCheckedSort"
      FROM matched_terms m GROUP BY m.term
    )`;
  }
  return Prisma.sql`, terms AS MATERIALIZED (
    SELECT m.term, MIN(m.text COLLATE "en-US-x-icu") AS "keywordSort"
    FROM matched_terms m GROUP BY m.term
  )`;
}

export function buildRankTrackerGroupedSql(
  projectId: string,
  query: RankTrackerQueryState,
  options: GroupedSqlOptions = {},
) {
  const candidatesOnly = Boolean(options.candidatesOnly);
  const requirements = groupedRequirements(query, candidatesOnly);
  const offset = (query.page - 1) * query.pageSize;
  const lens = lensPredicate(query.lens);
  const content = contentPredicate(query.filters, query.search, {
    deferExactRowPredicates: candidatesOnly,
  });
  const selectionSort = candidatesOnly
    ? { direction: "asc" as const, field: "keyword" as const }
    : query.sort;
  const order = groupedRankTrackerOrderBy(selectionSort);
  const page = candidatesOnly ? Prisma.empty : Prisma.sql`LIMIT ${query.pageSize} OFFSET ${offset}`;
  return Prisma.sql`
    WITH project_keyword_inputs AS MATERIALIZED (
      SELECT k.id, k."publicId", k."projectId", k.text, k."textNormalized", k.device::text AS device,
        k.topic, k.intent${requirements.rankingUrl ? Prisma.sql`, k."targetUrl"` : Prisma.empty},
        l."canonicalKey", l."displayName",
        l.hl AS "locationHl", l.kind::text AS "locationKind",
        COALESCE(pm.status::text, 'active') AS "marketStatus",
        row_number() OVER (ORDER BY k."createdAt" DESC, k.id DESC) AS "sourceOrdinal"
      FROM "keywords" k JOIN "locations" l ON l.id = k."locationId"
      LEFT JOIN "project_markets" pm ON pm."projectId" = k."projectId" AND pm."locationId" = k."locationId"
      WHERE k."projectId" = ${projectId} AND k."archivedAt" IS NULL
    ) ${groupedDerivedKeywordCtes(requirements)}, project_keywords AS MATERIALIZED (
      SELECT d.* FROM target_derived d
    ), project_locations AS (
      ${rankTrackerLocationsSql(projectId, "project_keyword_inputs")}
    ), lens_keywords AS MATERIALIZED (
      SELECT ${lensColumns(requirements)} FROM project_keywords k
      JOIN "locations" l ON l."canonicalKey" = k."canonicalKey"
      WHERE ${lens}
    ), matched AS MATERIALIZED (
      SELECT k.* FROM lens_keywords k ${contentColumns(query, candidatesOnly)}
      WHERE ${content}
    ), matched_terms AS MATERIALIZED (
      SELECT m.*, m."textNormalized" AS term FROM matched m
    )${termCtes(selectionSort)}, selected_terms AS (
      SELECT t.*, row_number() OVER (ORDER BY ${order}) AS ordinal FROM terms t
      ORDER BY ${order} ${page}
    ), selected_groups AS (
      SELECT t.term, t.ordinal, jsonb_agg(jsonb_build_object(
        'id', m.id, 'publicId', m."publicId", 'marketStatus', m."marketStatus"
      ) ORDER BY m."displayName" COLLATE "en-US-x-icu", m."locationHl" COLLATE "en-US-x-icu",
        m.device COLLATE "en-US-x-icu", m."publicId" COLLATE "en-US-x-icu") AS members
      FROM selected_terms t JOIN matched_terms m ON m.term = t.term
      GROUP BY t.term, t.ordinal
    )
    SELECT
      COALESCE((SELECT jsonb_agg(jsonb_build_object('term', term, 'members', members) ORDER BY ordinal)
        FROM selected_groups), '[]'::jsonb) AS groups,
      (SELECT COUNT(*) FROM project_keyword_inputs)::int AS "totalCount",
      (SELECT COUNT(*) FROM matched)::int AS "matchedTargetCount",
      (SELECT COUNT(*) FROM terms)::int AS "matchedGroupCount",
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id', "canonicalKey", 'displayName', "displayName",
        'kind', "locationKind", 'count', count) ORDER BY count DESC, "displayName", "canonicalKey")
        FROM project_locations), '[]'::jsonb) AS locations,
      jsonb_build_object(
        'positions', jsonb_build_array(
          jsonb_build_object('id','top3','label','Top 3','count',(SELECT COUNT(*) FROM lens_keywords WHERE position <= 3)),
          jsonb_build_object('id','top10','label','Top 10','count',(SELECT COUNT(*) FROM lens_keywords WHERE position <= 10)),
          jsonb_build_object('id','11-50','label','11-50','count',(SELECT COUNT(*) FROM lens_keywords WHERE position > 10 AND position <= 50)),
          jsonb_build_object('id','51-100','label','51-100','count',(SELECT COUNT(*) FROM lens_keywords WHERE position > 50 AND position <= 100))
        ),
        'tags', COALESCE((SELECT jsonb_agg(jsonb_build_object('label', label, 'count', count) ORDER BY ordinal)
          FROM (SELECT tag.label, COUNT(DISTINCT k.id)::int count,
            MIN(k."sourceOrdinal" * 1000 + tag.ordinal)::bigint ordinal
            FROM lens_keywords k CROSS JOIN LATERAL unnest(k.tags) WITH ORDINALITY tag(label, ordinal)
            WHERE btrim(tag.label) <> '' GROUP BY tag.label) f), '[]'::jsonb),
        'topics', COALESCE((SELECT jsonb_agg(jsonb_build_object('label', topic, 'count', count) ORDER BY ordinal)
          FROM (SELECT topic, COUNT(*)::int count, MIN("sourceOrdinal") ordinal
            FROM lens_keywords WHERE topic IS NOT NULL AND btrim(topic) <> '' GROUP BY topic) f), '[]'::jsonb),
        'intents', COALESCE((SELECT jsonb_agg(jsonb_build_object('label', intent, 'count', count) ORDER BY ordinal)
          FROM (SELECT intent, COUNT(*)::int count, MIN("sourceOrdinal") ordinal
            FROM lens_keywords WHERE intent IS NOT NULL AND btrim(intent) <> '' GROUP BY intent) f), '[]'::jsonb)
      ) AS facets`;
}

export function buildRankTrackerGroupedExplainSql(projectId: string, query: RankTrackerQueryState) {
  return Prisma.sql`EXPLAIN (ANALYZE, BUFFERS, VERBOSE) ${buildRankTrackerGroupedSql(projectId, query)}`;
}
