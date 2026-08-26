import "server-only";

import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { type Metrics, metricsFromChecks } from "./keyword-metrics";

// List metrics use the 12 newest checks; the detail page passes its 90-check window.
const METRICS_CHECK_WINDOW = 12;
type KeywordMetricFilters = { device?: "desktop" | "mobile" | null; tag?: string | null };

type KeywordMetricRow = {
  checks: unknown;
  keywordId: string;
};

const metricProjection = Prisma.sql`rc.raw`;

const volumeProjection = Prisma.sql`
  jsonb_strip_nulls(jsonb_build_object(
    'volume', rc.raw->'volume',
    'searchVolume', rc.raw->'searchVolume',
    'search_volume', rc.raw->'search_volume',
    'keyword_info', jsonb_strip_nulls(jsonb_build_object(
      'search_volume', rc.raw#>'{keyword_info,search_volume}'
    )),
    'keywordInfo', jsonb_strip_nulls(jsonb_build_object(
      'searchVolume', rc.raw#>'{keywordInfo,searchVolume}'
    )),
    'metrics', jsonb_strip_nulls(jsonb_build_object(
      'volume', rc.raw#>'{metrics,volume}',
      'searchVolume', rc.raw#>'{metrics,searchVolume}'
    ))
  ))
`;

function checksLateral(checkWindow: number, projection = metricProjection) {
  return Prisma.sql`
  SELECT jsonb_agg(projection ORDER BY sub."checkedAt" DESC, sub.id DESC) AS checks
  FROM (
    SELECT rc."checkedAt", rc.id, ${projection} AS projection
    FROM "rank_checks" rc
    WHERE rc."keywordId" = k.id
    ORDER BY rc."checkedAt" DESC, rc.id DESC
    LIMIT ${checkWindow}
  ) sub
`;
}

function metricsFromProjectedChecks(checks: unknown) {
  const rawChecks = Array.isArray(checks) ? checks : [];
  return metricsFromChecks(rawChecks.map((raw) => ({ raw })));
}

export async function fetchProjectKeywordMetrics(
  projectId: string,
  keywordLimit: number,
  filters: KeywordMetricFilters = {},
): Promise<Map<string, Metrics>> {
  const deviceFilter = filters.device
    ? Prisma.sql`AND k.device::text = ${filters.device}`
    : Prisma.empty;
  const tagFilter = filters.tag
    ? Prisma.sql`AND EXISTS (SELECT 1 FROM "keyword_tags" kt JOIN "tags" t ON t.id = kt."tagId" WHERE kt."keywordId" = k.id AND t.name = ${filters.tag})`
    : Prisma.empty;
  const rows = await prisma.$queryRaw<KeywordMetricRow[]>`
    SELECT k.id AS "keywordId", agg.checks
    FROM "keywords" k
    LEFT JOIN LATERAL (${checksLateral(METRICS_CHECK_WINDOW)}) agg ON true
    WHERE k."projectId" = ${projectId}
      ${deviceFilter}
      ${tagFilter}
    ORDER BY k."createdAt" DESC, k.id DESC
    LIMIT ${keywordLimit}
  `;

  return new Map(rows.map((row) => [row.keywordId, metricsFromProjectedChecks(row.checks)]));
}

export async function fetchProjectKeywordVolumes(
  projectId: string,
  keywordLimit: number,
  filters: KeywordMetricFilters = {},
): Promise<Map<string, number | null>> {
  const deviceFilter = filters.device
    ? Prisma.sql`AND k.device::text = ${filters.device}`
    : Prisma.empty;
  const tagFilter = filters.tag
    ? Prisma.sql`AND EXISTS (SELECT 1 FROM "keyword_tags" kt JOIN "tags" t ON t.id = kt."tagId" WHERE kt."keywordId" = k.id AND t.name = ${filters.tag})`
    : Prisma.empty;
  const rows = await prisma.$queryRaw<KeywordMetricRow[]>`
    SELECT k.id AS "keywordId", agg.checks
    FROM "keywords" k
    LEFT JOIN LATERAL (${checksLateral(METRICS_CHECK_WINDOW, volumeProjection)}) agg ON true
    WHERE k."projectId" = ${projectId}
      ${deviceFilter}
      ${tagFilter}
    ORDER BY k."createdAt" DESC, k.id DESC
    LIMIT ${keywordLimit}
  `;

  return new Map(rows.map((row) => [row.keywordId, metricsFromProjectedChecks(row.checks).volume]));
}

export async function fetchKeywordMetricsByIds(keywordIds: string[]) {
  if (keywordIds.length === 0) return new Map<string, Metrics>();
  const rows = await prisma.$queryRaw<KeywordMetricRow[]>(Prisma.sql`
    SELECT k.id AS "keywordId", agg.checks
    FROM "keywords" k
    LEFT JOIN LATERAL (${checksLateral(METRICS_CHECK_WINDOW)}) agg ON true
    WHERE k.id IN (${Prisma.join(keywordIds)})
  `);
  return new Map(rows.map((row) => [row.keywordId, metricsFromProjectedChecks(row.checks)]));
}

export async function fetchKeywordMetrics(
  keywordId: string,
  checkWindow = METRICS_CHECK_WINDOW,
): Promise<Metrics> {
  const rows = await prisma.$queryRaw<KeywordMetricRow[]>`
    SELECT k.id AS "keywordId", agg.checks
    FROM "keywords" k
    LEFT JOIN LATERAL (${checksLateral(checkWindow)}) agg ON true
    WHERE k.id = ${keywordId}
    LIMIT 1
  `;

  return metricsFromProjectedChecks(rows[0]?.checks);
}
