import { Prisma } from "@/lib/generated/prisma/client";
import {
  type GroupedMetricRequirements,
  groupedMetricProjection,
} from "./rank-tracker-grouped-projection";

export type GroupedDerivedRequirements = {
  baseline: boolean;
  hasRankData: boolean;
  lastCheck: "full" | "timestamp" | "none";
  metrics: GroupedMetricRequirements;
  rankingPages: boolean;
  rankingUrl: boolean;
  serpFeatures: boolean;
};

function serpFeatureCtes(includeSerpFeatures: boolean) {
  if (!includeSerpFeatures) return Prisma.empty;

  return Prisma.sql`
    , serp_strings AS (
      SELECT rc."keywordId",
        CASE
          WHEN normalized.key ~ 'featured|answer_box' THEN 'featured'
          WHEN normalized.key ~ 'people|related_question' THEN 'paa'
          WHEN normalized.key ~ 'sitelink' THEN 'sitelinks'
          WHEN normalized.key ~ 'image' THEN 'image'
          WHEN normalized.key ~ 'video' THEN 'video'
          WHEN normalized.key ~ '(^|_)ai(_|$)|ai_overview' THEN 'ai'
        END AS feature,
        row_number() OVER (
          PARTITION BY rc."keywordId" ORDER BY rc."checkedAt" DESC, rc.id DESC
        ) AS ordinal
      FROM "rank_checks" rc
      JOIN project_keyword_inputs k ON k.id = rc."keywordId"
      CROSS JOIN LATERAL jsonb_path_query(rc.raw, '$.** ? (@.type() == "string")') value
      CROSS JOIN LATERAL (
        SELECT lower(regexp_replace(trim(both '"' from value::text), '[^a-z0-9]+', '_', 'g')) key
      ) normalized
      WHERE rc.raw IS NOT NULL
    ), serp_features AS (
      SELECT "keywordId", array_agg(DISTINCT feature) FILTER (WHERE feature IS NOT NULL) AS "serpFeatures"
      FROM serp_strings WHERE ordinal <= 600 GROUP BY "keywordId"
    )`;
}

function baselineCtes(includeBaseline: boolean) {
  if (!includeBaseline) return Prisma.empty;

  return Prisma.sql`, baseline_boundaries AS (
      SELECT current."keywordId", MAX(boundary."checkedAt") AS "boundaryAt"
      FROM comparable_current current
      JOIN bounded_rank_checks boundary ON boundary."keywordId" = current."keywordId"
      WHERE boundary.status = 'completed' AND boundary."checkedAt" < current."checkedAt"
        AND (boundary."normalizationVersion" IS DISTINCT FROM current."normalizationVersion"
          OR boundary."requestedDepth" IS DISTINCT FROM current."requestedDepth")
      GROUP BY current."keywordId"
    ), rank_baselines AS (
      SELECT DISTINCT ON (current."keywordId") current."keywordId", recent.position
      FROM comparable_current current
      JOIN bounded_rank_checks recent ON recent."keywordId" = current."keywordId"
      LEFT JOIN baseline_boundaries boundary ON boundary."keywordId" = current."keywordId"
      WHERE recent.status = 'completed' AND recent.position > 0
        AND recent."normalizationVersion" = current."normalizationVersion"
        AND recent."requestedDepth" = current."requestedDepth"
        AND recent."checkedAt"::date <> current."checkedAt"::date
        AND (boundary."boundaryAt" IS NULL OR recent."checkedAt" >= boundary."boundaryAt")
      ORDER BY current."keywordId", recent."checkedAt" DESC, recent.id DESC
    )`;
}

export function groupedDerivedKeywordCtes(requirements: GroupedDerivedRequirements) {
  const needsMetrics = requirements.metrics.volume || requirements.metrics.difficulty;
  const needsLatestAttempt = requirements.lastCheck !== "none";
  const needsRankCheckRankingUrl = requirements.rankingUrl || requirements.rankingPages;
  const needsSharedBoundedRankChecks =
    requirements.baseline || needsLatestAttempt || requirements.rankingPages;
  const rankCheckInputRankingUrl = needsRankCheckRankingUrl
    ? Prisma.sql`, rc."rankingUrl"`
    : Prisma.empty;
  const boundedRecentRankingUrl = needsRankCheckRankingUrl
    ? Prisma.sql`, recent."rankingUrl"`
    : Prisma.empty;
  const directRecentRankingUrl = requirements.rankingUrl
    ? Prisma.sql`, recent."rankingUrl"`
    : Prisma.empty;
  const directCurrentRankingUrl = requirements.rankingUrl
    ? Prisma.sql`, current."rankingUrl"`
    : Prisma.empty;
  const sharedCurrentRankingUrl = requirements.rankingUrl
    ? Prisma.sql`, "rankingUrl"`
    : Prisma.empty;
  const metricJoin = needsMetrics
    ? Prisma.sql`
      LEFT JOIN latest_metric_raw metric ON metric."keywordId" = k.id
      CROSS JOIN LATERAL (${groupedMetricProjection(Prisma.sql`metric.raw`, requirements.metrics)}) metrics`
    : Prisma.empty;
  const serpFeatureJoin = requirements.serpFeatures
    ? Prisma.sql`LEFT JOIN serp_features features ON features."keywordId" = k.id`
    : Prisma.empty;
  const latestAttemptJoin = needsLatestAttempt
    ? Prisma.sql`LEFT JOIN latest_attempts latest ON latest."keywordId" = k.id`
    : Prisma.empty;
  const baselineJoin = requirements.baseline
    ? Prisma.sql`LEFT JOIN rank_baselines baseline ON baseline."keywordId" = k.id`
    : Prisma.empty;
  const rankPagesJoin = requirements.rankingPages
    ? Prisma.sql`LEFT JOIN rank_pages pages ON pages."keywordId" = k.id`
    : Prisma.empty;
  const latestAttemptColumns =
    requirements.lastCheck === "full"
      ? Prisma.sql`, latest.id AS "latestAttemptId", latest.status AS "lastCheckStatus",
        latest."checkedAt" AS "lastCheckAt"`
      : requirements.lastCheck === "timestamp"
        ? Prisma.sql`, latest."checkedAt" AS "lastCheckAt"`
        : Prisma.empty;

  const boundedRankChecks = Prisma.sql`bounded_rank_checks AS MATERIALIZED (
      SELECT recent.id, recent."keywordId", recent.status, recent."checkedAt",
        recent."normalizationVersion", recent."requestedDepth"${boundedRecentRankingUrl}, recent.position
      FROM project_keyword_inputs k
      CROSS JOIN LATERAL (
        SELECT rc.id, rc."keywordId", rc.status, rc."checkedAt", rc."normalizationVersion",
          rc."requestedDepth"${rankCheckInputRankingUrl}, rc.position
        FROM "rank_checks" rc
        WHERE rc."keywordId" = k.id AND rc.status <> 'deferred'
        ORDER BY rc."checkedAt" DESC, rc.id DESC
        LIMIT 12
      ) recent
    )`;
  const sharedCurrentChecks = Prisma.sql`current_checks AS (
      SELECT DISTINCT ON ("keywordId") "keywordId", id, "checkedAt", "normalizationVersion",
        "requestedDepth"${sharedCurrentRankingUrl}, position
      FROM bounded_rank_checks WHERE status = 'completed'
      ORDER BY "keywordId", "checkedAt" DESC, id DESC
    )`;
  const directCurrentCheckJoin = Prisma.sql`LEFT JOIN LATERAL (
      SELECT current.id, current."checkedAt", current."normalizationVersion",
        current."requestedDepth"${directCurrentRankingUrl}, current.position
      FROM (
        SELECT recent.id, recent."keywordId", recent."checkedAt", recent."normalizationVersion",
          recent."requestedDepth"${directRecentRankingUrl}, recent.position
        FROM (
          SELECT rc.id, rc."keywordId", rc.status, rc."checkedAt", rc."normalizationVersion",
            rc."requestedDepth"${rankCheckInputRankingUrl}, rc.position
          FROM "rank_checks" rc
          WHERE rc."keywordId" = k.id AND rc.status <> 'deferred'
          ORDER BY rc."checkedAt" DESC, rc.id DESC
          LIMIT 12
        ) recent
        WHERE recent.status = 'completed'
        ORDER BY recent."checkedAt" DESC, recent.id DESC
        LIMIT 1
      ) current
      WHERE current."normalizationVersion" IS NOT NULL AND current."requestedDepth" IS NOT NULL
    ) current ON true`;

  return Prisma.sql`${
    needsSharedBoundedRankChecks
      ? Prisma.sql`, ${boundedRankChecks}, ${sharedCurrentChecks}, comparable_current AS NOT MATERIALIZED (
      SELECT * FROM current_checks
      WHERE "normalizationVersion" IS NOT NULL AND "requestedDepth" IS NOT NULL
    )`
      : Prisma.empty
  }${
    needsLatestAttempt
      ? Prisma.sql`, latest_attempts AS (
      SELECT DISTINCT ON ("keywordId") "keywordId", id, status, "checkedAt"
      FROM bounded_rank_checks ORDER BY "keywordId", "checkedAt" DESC, id DESC
    )`
      : Prisma.empty
  }${baselineCtes(requirements.baseline)}${
    requirements.rankingPages
      ? Prisma.sql`, rank_pages AS (
      SELECT "keywordId", COUNT(DISTINCT "rankingUrl")::int AS "rankingPages"
      FROM bounded_rank_checks
      WHERE status = 'completed' AND "rankingUrl" IS NOT NULL
      GROUP BY "keywordId"
    )`
      : Prisma.empty
  }${
    needsMetrics
      ? Prisma.sql`, latest_metric_raw AS (
      SELECT DISTINCT ON (rc."keywordId") rc."keywordId", rc.raw
      FROM "rank_checks" rc
      JOIN project_keyword_inputs k ON k.id = rc."keywordId"
      WHERE rc.raw IS NOT NULL
      ORDER BY rc."keywordId", rc."checkedAt" DESC, rc.id DESC
    )`
      : Prisma.empty
  }, grouped_tags AS (
      SELECT kt."keywordId", array_agg(t.name ORDER BY t.name) AS tags
      FROM "keyword_tags" kt
      JOIN project_keyword_inputs k ON k.id = kt."keywordId"
      JOIN tags t ON t.id = kt."tagId"
      GROUP BY kt."keywordId"
    )${serpFeatureCtes(requirements.serpFeatures)}, target_derived AS (
      SELECT k.id, k."publicId", k."projectId", k.text, k."textNormalized", k.device,
        k.topic, k.intent, k."canonicalKey", k."displayName", k."locationHl", k."locationKind",
        k."marketStatus", k."sourceOrdinal", COALESCE(current.position, 101) AS position,
        COALESCE(tags.tags, ARRAY[]::text[]) AS tags${requirements.rankingUrl ? Prisma.sql`, k."targetUrl", current."rankingUrl" AS "rankingUrl"` : Prisma.empty}${requirements.baseline ? Prisma.sql`, baseline.position AS "positionBaseline"` : Prisma.empty}${latestAttemptColumns}${requirements.rankingPages ? Prisma.sql`, COALESCE(pages."rankingPages", 0) AS "rankingPages"` : Prisma.empty}${requirements.hasRankData ? Prisma.sql`, current.id IS NOT NULL AS "hasRankData"` : Prisma.empty}${requirements.serpFeatures ? Prisma.sql`, COALESCE(features."serpFeatures", ARRAY[]::text[]) AS "serpFeatures"` : Prisma.empty}${requirements.metrics.volume ? Prisma.sql`, metrics.volume` : Prisma.empty}${requirements.metrics.difficulty ? Prisma.sql`, metrics."groupedDifficulty"` : Prisma.empty}
      FROM project_keyword_inputs k
      ${
        needsSharedBoundedRankChecks
          ? Prisma.sql`LEFT JOIN comparable_current current ON current."keywordId" = k.id`
          : directCurrentCheckJoin
      }
      LEFT JOIN grouped_tags tags ON tags."keywordId" = k.id
      ${latestAttemptJoin}
      ${baselineJoin}
      ${rankPagesJoin}
      ${metricJoin}
      ${serpFeatureJoin}
    )`;
}
