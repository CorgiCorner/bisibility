import "server-only";

import { providerLabel } from "@/lib/checks/attempts";
import type {
  RetrievedResults,
  StoredResultsIndexEntry,
  StoredResultsSummary,
  StoredResultsTier,
} from "@/lib/checks/contract";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { getRankCheckRawRetentionDays } from "@/lib/rank-check/raw-retention";
import { computeFullDetailUntil, retrievedCheckResult } from "./retrieved-results-detail";
import { capturedStopOnMatch } from "./retrieved-results-provenance";

const DEFAULT_LIMIT = 90;

type IndexRow = {
  degradedToCountry?: boolean;
  checkId: string;
  checkedAt: Date;
  position: number | null;
  provider: string;
  requestedDepth: number | null;
  tier: StoredResultsTier;
  observationCompleteness?: string | null;
  recordedNoMatchDepth?: number | null;
  retrieved: number | null;
};

type SummaryRow = {
  checkId: string;
  checkedAt: Date;
  requestedDepth: number | null;
  tier: StoredResultsTier;
  observationCompleteness?: string | null;
  retrieved: number | null;
};

function mapIndexRow(row: IndexRow, retentionDays: number | null): StoredResultsIndexEntry {
  const fullDetailUntil =
    row.tier === "full" ? computeFullDetailUntil(row.checkedAt, retentionDays) : null;
  return {
    ...(row.recordedNoMatchDepth ? { recordedNoMatchDepth: row.recordedNoMatchDepth } : {}),
    checkId: row.checkId,
    degradedToCountry: row.degradedToCountry ?? false,
    checkedAt: row.checkedAt.toISOString(),
    fullDetailUntil,
    position: row.position,
    provider: row.provider,
    providerLabel: providerLabel(row.provider),
    requestedDepth: row.requestedDepth,
    retrievedPositions: row.retrieved,
    stoppedAtResult: row.tier === "full" ? capturedStopOnMatch(row.observationCompleteness) : null,
    tier: row.tier,
  };
}

function mapSummaryRow(row: SummaryRow, retentionDays: number | null): StoredResultsSummary {
  const fullDetailUntil =
    row.tier === "full" ? computeFullDetailUntil(row.checkedAt, retentionDays) : null;
  return {
    fullDetailUntil,
    requestedDepth: row.requestedDepth,
    retrievedPositions: row.retrieved,
    stoppedAtResult: row.tier === "full" ? capturedStopOnMatch(row.observationCompleteness) : null,
    tier: row.tier,
  };
}

export async function storedResultsIndex(input: {
  projectId: string;
  keywordPublicId: string;
  limit?: number;
}): Promise<StoredResultsIndexEntry[]> {
  const limit = input.limit ?? DEFAULT_LIMIT;
  const rows = await prisma.$queryRaw<IndexRow[]>(Prisma.sql`
    SELECT
      rc."publicId" AS "checkId",
      rc."checkedAt",
      rc."position",
      rc."provider",
      rc."requestedDepth",
      rc."degradedToCountry",
      CASE WHEN rc."position" IS NULL AND rc."errorCode" IS NULL
        AND rc."normalizationVersion" = 'v2'
        AND rc."raw"->'normalization'->>'outcome' = 'no_match'
        AND rc."requestedDepth" > 0
        AND (rc."raw"->'normalization'->'anomalies' IS NULL OR rc."raw"->'normalization'->'anomalies' = '[]'::jsonb)
        AND (SELECT count(DISTINCT CASE WHEN e->>'rank' ~ '^[0-9]{1,3}$' THEN (e->>'rank')::int END)
          FROM jsonb_array_elements(CASE WHEN jsonb_typeof(rc."raw"->'organic_results')='array'
            THEN rc."raw"->'organic_results' ELSE '[]'::jsonb END) e
          WHERE (CASE WHEN e->>'rank' ~ '^[0-9]{1,3}$' THEN (e->>'rank')::int END)
            BETWEEN 1 AND rc."requestedDepth") = rc."requestedDepth"
        THEN rc."requestedDepth" ELSE NULL END AS "recordedNoMatchDepth",
      CASE
        WHEN jsonb_typeof("raw"->'organic_results') = 'array' THEN 'full'
        WHEN "organicRanks" IS NOT NULL OR jsonb_typeof("raw") NOT IN ('null') THEN 'compact'
        ELSE 'none'
      END AS tier,
      (SELECT max((e->>'rank')::int) FROM jsonb_array_elements("raw"->'organic_results') e) AS retrieved,
      ob."completeness" AS "observationCompleteness"
    FROM "rank_checks" rc
    JOIN "keywords" k ON k."id" = rc."keywordId"
    LEFT JOIN "observation_runs" ob ON ob."rankCheckId" = rc."id"
      AND ob."projectId" = k."projectId"
    WHERE k."projectId" = ${input.projectId}
      AND k."publicId" = ${input.keywordPublicId}
      AND rc."status" = 'completed'
    ORDER BY rc."checkedAt" DESC, rc."publicId" DESC
    LIMIT ${limit}
  `);
  const retentionDays = getRankCheckRawRetentionDays();
  return rows.map((row) => mapIndexRow(row, retentionDays));
}

export async function storedResultsSummaries(input: {
  projectId: string;
  checkIds: readonly string[];
}): Promise<Map<string, StoredResultsSummary>> {
  if (input.checkIds.length === 0) return new Map();
  const rows = await prisma.$queryRaw<SummaryRow[]>(Prisma.sql`
    SELECT
      rc."publicId" AS "checkId",
      rc."checkedAt",
      rc."requestedDepth",
      CASE
        WHEN jsonb_typeof("raw"->'organic_results') = 'array' THEN 'full'
        WHEN "organicRanks" IS NOT NULL OR jsonb_typeof("raw") NOT IN ('null') THEN 'compact'
        ELSE 'none'
      END AS tier,
      (SELECT max((e->>'rank')::int) FROM jsonb_array_elements("raw"->'organic_results') e) AS retrieved,
      ob."completeness" AS "observationCompleteness"
    FROM "rank_checks" rc
    JOIN "keywords" k ON k."id" = rc."keywordId"
    LEFT JOIN "observation_runs" ob ON ob."rankCheckId" = rc."id"
      AND ob."projectId" = k."projectId"
    WHERE k."projectId" = ${input.projectId}
      AND rc."publicId" IN (${Prisma.join(input.checkIds)})
      AND rc."status" = 'completed'
  `);
  const retentionDays = getRankCheckRawRetentionDays();
  return new Map(rows.map((row) => [row.checkId, mapSummaryRow(row, retentionDays)]));
}

export async function loadRetrievedResultsForChecks(input: {
  projectId: string;
  checkIds: readonly string[];
}): Promise<RetrievedResults[]> {
  if (input.checkIds.length === 0) return [];
  const checks = await prisma.rankCheck.findMany({
    orderBy: [{ checkedAt: "desc" }, { publicId: "desc" }],
    select: {
      checkedAt: true,
      organicRanks: true,
      observationRun: {
        select: {
          completeness: true,
          engine: true,
          surface: true,
          projectId: true,
          configuredScope: true,
          effectiveScope: true,
          requestPolicy: true,
          items: {
            orderBy: { ordinal: "asc" },
            select: {
              blockPosition: true,
              businessName: true,
              cid: true,
              mapsUrl: true,
              ordinal: true,
              placeId: true,
              positionInBlock: true,
              rankScale: true,
              promotion: true,
              sourcePage: true,
              sourceBlockId: true,
              sourceOrdinal: true,
              observedAt: true,
              rating: true,
              resultKind: true,
              rankAbsolute: true,
              rankGroup: true,
              title: true,
              url: true,
              domain: true,
            },
          },
        },
      },
      position: true,
      provider: true,
      publicId: true,
      rankingUrl: true,
      raw: true,
      requestedDepth: true,
    },
    where: {
      publicId: { in: [...input.checkIds] },
      keyword: { projectId: input.projectId },
      status: "completed",
    },
  });

  const retentionDays = getRankCheckRawRetentionDays();

  return Promise.all(
    checks.map((check) => retrievedCheckResult(input.projectId, check, retentionDays)),
  );
}
