import { Prisma } from "@/lib/generated/prisma/client";
import {
  difficultyExpression,
  latestTrafficExpression,
  serpFeaturesExpression,
  volumeExpression,
} from "./rank-tracker-list-projections";

export const derivedKeywordColumns = Prisma.sql`
  SELECT COALESCE(comparable_current.position, 101) AS position,
    baseline.position AS "positionBaseline", comparable_current."rankingUrl" AS "rankingUrl",
    latest_attempt.id AS "latestAttemptId", latest_attempt.status AS "lastCheckStatus",
    latest_attempt."checkedAt" AS "lastCheckAt", COALESCE(url_history."rankingPages", 0) AS "rankingPages",
    COALESCE(tags.names, ARRAY[]::text[]) AS tags, ${volumeExpression} AS volume,
    ${difficultyExpression} AS difficulty, ${serpFeaturesExpression} AS "serpFeatures",
    ${latestTrafficExpression} AS traffic
  FROM (SELECT 1) seed
  LEFT JOIN LATERAL (
    SELECT recent.* FROM (
      SELECT rc.* FROM "rank_checks" rc WHERE rc."keywordId" = k.id AND rc.status <> 'deferred'
      ORDER BY rc."checkedAt" DESC, rc.id DESC LIMIT 12
    ) recent ORDER BY recent."checkedAt" DESC, recent.id DESC LIMIT 1
  ) latest_attempt ON true
  LEFT JOIN LATERAL (
    SELECT recent.* FROM (
      SELECT rc.* FROM "rank_checks" rc WHERE rc."keywordId" = k.id AND rc.status <> 'deferred'
      ORDER BY rc."checkedAt" DESC, rc.id DESC LIMIT 12
    ) recent WHERE recent.status = 'completed'
    ORDER BY recent."checkedAt" DESC, recent.id DESC LIMIT 1
  ) current_check ON true
  LEFT JOIN LATERAL (
    SELECT current_check.* WHERE current_check."normalizationVersion" IS NOT NULL
      AND current_check."requestedDepth" IS NOT NULL
  ) comparable_current ON true
  LEFT JOIN LATERAL (
    SELECT recent.position FROM (
      SELECT rc.* FROM "rank_checks" rc WHERE rc."keywordId" = k.id AND rc.status <> 'deferred'
      ORDER BY rc."checkedAt" DESC, rc.id DESC LIMIT 12
    ) recent WHERE recent.status = 'completed' AND recent.position > 0
      AND recent."normalizationVersion" = comparable_current."normalizationVersion"
      AND recent."requestedDepth" = comparable_current."requestedDepth"
      AND recent."checkedAt"::date <> comparable_current."checkedAt"::date
      AND NOT EXISTS (
        SELECT 1 FROM (
          SELECT rc.* FROM "rank_checks" rc WHERE rc."keywordId" = k.id AND rc.status <> 'deferred'
          ORDER BY rc."checkedAt" DESC, rc.id DESC LIMIT 12
        ) boundary WHERE boundary.status = 'completed'
          AND boundary."checkedAt" > recent."checkedAt" AND boundary."checkedAt" < comparable_current."checkedAt"
          AND (boundary."normalizationVersion" IS DISTINCT FROM comparable_current."normalizationVersion"
            OR boundary."requestedDepth" IS DISTINCT FROM comparable_current."requestedDepth")
      ) ORDER BY recent."checkedAt" DESC, recent.id DESC LIMIT 1
  ) baseline ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(DISTINCT recent."rankingUrl")::int AS "rankingPages" FROM (
      SELECT rc."rankingUrl", rc.status FROM "rank_checks" rc
      WHERE rc."keywordId" = k.id AND rc.status <> 'deferred'
      ORDER BY rc."checkedAt" DESC, rc.id DESC LIMIT 12
    ) recent WHERE recent.status = 'completed' AND recent."rankingUrl" IS NOT NULL
  ) url_history ON true
  LEFT JOIN LATERAL (
    SELECT array_agg(t.name ORDER BY t.name) AS names FROM "keyword_tags" kt
    JOIN "tags" t ON t.id = kt."tagId" WHERE kt."keywordId" = k.id
  ) tags ON true`;
