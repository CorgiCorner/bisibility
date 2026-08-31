import { Prisma } from "@/lib/generated/prisma/client";
import type { RankTrackerQueryState } from "@/lib/keywords/rank-tracker-query-types";
import { derivedKeywordColumns } from "./rank-tracker-list-derived";
import { contentPredicate, lensPredicate } from "./rank-tracker-list-filters";
import { rankTrackerOrderBy } from "./rank-tracker-list-sort";

export function buildRankTrackerListSql(
  projectId: string,
  query: RankTrackerQueryState,
  options: {
    candidateCursor?: { createdAt: Date; id: string };
    candidateScan?: boolean;
    candidatesOnly?: boolean;
    publicIds?: boolean;
    selectionLimit?: number;
    selectionOffset?: number;
    unpaginated?: boolean;
  } = {},
) {
  const offset = (query.page - 1) * query.pageSize;
  const lens = lensPredicate(query.lens);
  const content = contentPredicate(query.filters, query.search, {
    deferExactRowPredicates: options.candidatesOnly,
  });
  const requestedOrder = rankTrackerOrderBy(query.sort);
  const order = options.candidateScan ? Prisma.sql`k."createdAt" DESC, k.id DESC` : requestedOrder;
  const candidateCursor = options.candidateCursor
    ? Prisma.sql`WHERE (k."createdAt", k.id) < (${options.candidateCursor.createdAt}, ${options.candidateCursor.id})`
    : Prisma.empty;
  return Prisma.sql`
    WITH project_keywords AS MATERIALIZED (
      SELECT k.*, l."canonicalKey", l."displayName", l.kind::text AS "locationKind",
        row_number() OVER (ORDER BY k."createdAt" DESC, k.id DESC) AS "sourceOrdinal", d.*
      FROM "keywords" k JOIN "locations" l ON l.id = k."locationId"
      LEFT JOIN "keyword_schedules" ks ON ks."keywordId" = k.id
      LEFT JOIN "project_defaults" pd ON pd."projectId" = k."projectId"
      CROSS JOIN LATERAL (${derivedKeywordColumns}) d
      WHERE k."projectId" = ${projectId}
    ), lens_keywords AS MATERIALIZED (
      SELECT k.* FROM project_keywords k
      JOIN "locations" l ON l."canonicalKey" = k."canonicalKey"
      CROSS JOIN LATERAL (SELECT k.position, k."positionBaseline", k."rankingUrl", k."lastCheckStatus",
        k."lastCheckAt", k."latestAttemptId", k."rankingPages", k.tags, k.volume, k.difficulty, k."serpFeatures", k.traffic) d
      WHERE ${lens}
    ), matched AS MATERIALIZED (
      SELECT k.* FROM lens_keywords k
      JOIN "locations" l ON l."canonicalKey" = k."canonicalKey"
      LEFT JOIN "keyword_schedules" ks ON ks."keywordId" = k.id
      LEFT JOIN "project_defaults" pd ON pd."projectId" = k."projectId"
      CROSS JOIN LATERAL (SELECT k.position, k."positionBaseline", k."rankingUrl", k."lastCheckStatus",
        k."lastCheckAt", k."latestAttemptId", k."rankingPages", k.tags, k.volume, k.difficulty, k."serpFeatures", k.traffic) d
      WHERE ${content}
    ), selected AS (
      SELECT ${options.publicIds ? Prisma.sql`k."publicId"` : Prisma.sql`k.id`} AS id, k."createdAt",
        row_number() OVER (ORDER BY ${order}) AS ordinal
      FROM matched k JOIN "locations" l ON l."canonicalKey" = k."canonicalKey"
      LEFT JOIN "keyword_schedules" ks ON ks."keywordId" = k.id
      LEFT JOIN "project_defaults" pd ON pd."projectId" = k."projectId"
      CROSS JOIN LATERAL (SELECT k.position, k."positionBaseline", k."rankingUrl", k."lastCheckStatus",
        k."lastCheckAt", k."latestAttemptId", k."rankingPages", k.tags, k.volume, k.difficulty, k."serpFeatures", k.traffic) d
      ${candidateCursor}
      ORDER BY ${order} ${
        options.selectionLimit !== undefined
          ? options.candidateScan
            ? Prisma.sql`LIMIT ${options.selectionLimit}`
            : Prisma.sql`LIMIT ${options.selectionLimit} OFFSET ${options.selectionOffset ?? 0}`
          : options.candidatesOnly || options.unpaginated
            ? Prisma.empty
            : Prisma.sql`LIMIT ${query.pageSize} OFFSET ${offset}`
      }
    )
    SELECT
      COALESCE((SELECT jsonb_agg(id ORDER BY ordinal) FROM selected), '[]'::jsonb) AS "keywordIds",
      (SELECT jsonb_build_object('createdAt', "createdAt", 'id', id)
        FROM selected ORDER BY ordinal DESC LIMIT 1) AS "nextCandidateCursor",
      (SELECT COUNT(*) FROM project_keywords)::int AS "totalCount",
      (SELECT COUNT(*) FROM matched)::int AS "matchedTargetCount",
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id', "canonicalKey", 'displayName', "displayName",
        'kind', "locationKind", 'count', count) ORDER BY count DESC, "displayName", "canonicalKey")
        FROM (SELECT "canonicalKey", "displayName", "locationKind", COUNT(*)::int count
          FROM project_keywords GROUP BY 1,2,3) locations), '[]'::jsonb) AS locations,
      jsonb_build_object(
        'positions', jsonb_build_array(
          jsonb_build_object('id','top3','label','Top 3','count',(SELECT COUNT(*) FROM lens_keywords WHERE position <= 3)),
          jsonb_build_object('id','top10','label','Top 10','count',(SELECT COUNT(*) FROM lens_keywords WHERE position <= 10)),
          jsonb_build_object('id','11-50','label','11-50','count',(SELECT COUNT(*) FROM lens_keywords WHERE position > 10 AND position <= 50)),
          jsonb_build_object('id','51-100','label','51-100','count',(SELECT COUNT(*) FROM lens_keywords WHERE position > 50 AND position <= 100))
        ),
        'tags', COALESCE((SELECT jsonb_agg(jsonb_build_object('label', label, 'count', count) ORDER BY ordinal)
          FROM (
            SELECT tag.label, COUNT(DISTINCT k.id)::int count,
              MIN(k."sourceOrdinal" * 1000 + tag.ordinal)::bigint ordinal
            FROM lens_keywords k
            CROSS JOIN LATERAL unnest(k.tags) WITH ORDINALITY tag(label, ordinal)
            WHERE btrim(tag.label) <> ''
            GROUP BY tag.label
          ) f), '[]'::jsonb),
        'topics', COALESCE((SELECT jsonb_agg(jsonb_build_object('label', topic, 'count', count) ORDER BY ordinal)
          FROM (SELECT topic, COUNT(*)::int count, MIN("sourceOrdinal") ordinal
            FROM lens_keywords WHERE topic IS NOT NULL AND btrim(topic) <> '' GROUP BY topic) f), '[]'::jsonb),
        'intents', COALESCE((SELECT jsonb_agg(jsonb_build_object('label', intent, 'count', count) ORDER BY ordinal)
          FROM (SELECT intent, COUNT(*)::int count, MIN("sourceOrdinal") ordinal
            FROM lens_keywords WHERE intent IS NOT NULL AND btrim(intent) <> '' GROUP BY intent) f), '[]'::jsonb)
      ) AS facets`;
}
