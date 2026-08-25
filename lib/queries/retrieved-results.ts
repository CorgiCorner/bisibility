import "server-only";

import { providerLabel } from "@/lib/checks/attempts";
import type {
  RetrievedResults,
  RetrievedRow,
  StoredResultsIndexEntry,
  StoredResultsSummary,
  StoredResultsTier,
} from "@/lib/checks/contract";
import { aiOverviewState } from "@/lib/checks/retrieved-results-model";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import {
  organicDomainRanksFromRaw,
  storedOrganicDomainRanks,
} from "@/lib/rank-check/organic-ranks";
import { getRankCheckRawRetentionDays } from "@/lib/rank-check/raw-retention";

const DEFAULT_LIMIT = 90;

type IndexRow = {
  degradedToCountry?: boolean;
  checkId: string;
  checkedAt: Date;
  position: number | null;
  provider: string;
  requestedDepth: number | null;
  tier: StoredResultsTier;
  stoppedAtResult?: boolean | null;
  retrieved: number | null;
};

type SummaryRow = {
  checkId: string;
  checkedAt: Date;
  requestedDepth: number | null;
  tier: StoredResultsTier;
  stoppedAtResult?: boolean | null;
  retrieved: number | null;
};

type CheckRow = {
  publicId: string;
  checkedAt: Date;
  provider: string;
  position: number | null;
  requestedDepth: number | null;
  raw: unknown;
  organicRanks: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function computeFullDetailUntil(checkedAt: Date, retentionDays: number | null): string | null {
  if (retentionDays === null) return null;
  return new Date(checkedAt.getTime() + retentionDays * 24 * 60 * 60 * 1000).toISOString();
}

function mapIndexRow(row: IndexRow, retentionDays: number | null): StoredResultsIndexEntry {
  const fullDetailUntil =
    row.tier === "full" ? computeFullDetailUntil(row.checkedAt, retentionDays) : null;
  return {
    checkId: row.checkId,
    degradedToCountry: row.degradedToCountry ?? false,
    checkedAt: row.checkedAt.toISOString(),
    fullDetailUntil,
    position: row.position,
    provider: row.provider,
    providerLabel: providerLabel(row.provider),
    requestedDepth: row.requestedDepth,
    retrievedPositions: row.retrieved,
    stoppedAtResult: row.tier === "full" ? (row.stoppedAtResult ?? null) : null,
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
    stoppedAtResult: row.tier === "full" ? (row.stoppedAtResult ?? null) : null,
    tier: row.tier,
  };
}

function organicResultsFromRaw(raw: unknown): Record<string, unknown>[] {
  if (!isRecord(raw) || !Array.isArray(raw.organic_results)) return [];
  return raw.organic_results.filter((item): item is Record<string, unknown> => isRecord(item));
}

function maxRankFromRaw(raw: unknown): number | null {
  const results = organicResultsFromRaw(raw);
  let max = 0;
  for (const item of results) {
    const rank = typeof item.rank === "number" ? item.rank : Number(item.rank);
    if (Number.isInteger(rank) && rank > max) max = rank;
  }
  return max || null;
}

function normalizeFeatures(raw: unknown): string[] {
  if (!isRecord(raw) || !Array.isArray(raw.serp_features)) return [];
  return raw.serp_features.filter((f): f is string => typeof f === "string");
}

function normalizationOutcome(raw: unknown): string | null {
  if (!isRecord(raw) || !isRecord(raw.normalization)) return null;
  const outcome = raw.normalization.outcome;
  return typeof outcome === "string" ? outcome : null;
}

function buildFullResult(
  check: CheckRow,
  features: string[],
  retrievedPositions: number,
  retentionDays: number | null,
): RetrievedResults {
  const results = organicResultsFromRaw(check.raw);
  const rows: RetrievedRow[] = results
    .map((item): RetrievedRow | null => {
      const rank = typeof item.rank === "number" ? item.rank : Number(item.rank);
      if (!Number.isInteger(rank)) return null;
      const domain = typeof item.domain === "string" ? item.domain : "";
      const url = typeof item.url === "string" ? item.url : null;
      const title = typeof item.title === "string" ? item.title : null;
      return {
        domain,
        position: rank,
        title,
        tracked: check.position !== null && rank === check.position,
        url,
      };
    })
    .filter((r): r is RetrievedRow => r !== null);

  return {
    aiOverview: aiOverviewState(check.provider, features),
    checkId: check.publicId,
    checkedAt: check.checkedAt.toISOString(),
    features,
    fullDetailUntil: computeFullDetailUntil(check.checkedAt, retentionDays),
    provider: check.provider,
    providerLabel: providerLabel(check.provider),
    requestedDepth: check.requestedDepth,
    retrievedPositions,
    rows,
    stoppedAtResult:
      normalizationOutcome(check.raw) === "match" &&
      retrievedPositions < (check.requestedDepth ?? 0),
    tier: "full",
    trackedPosition: check.position,
  };
}

function buildCompactResult(check: CheckRow, retentionDays: number | null): RetrievedResults {
  const ranks =
    storedOrganicDomainRanks(check.organicRanks) ?? organicDomainRanksFromRaw(check.raw);
  const domains = (ranks ?? []).map((r) => ({
    bestPosition: r.position,
    domain: r.domain,
  }));
  return {
    checkId: check.publicId,
    checkedAt: check.checkedAt.toISOString(),
    domains,
    expiredAt: computeFullDetailUntil(check.checkedAt, retentionDays),
    provider: check.provider,
    providerLabel: providerLabel(check.provider),
    tier: "compact",
  };
}

function classifyTier(raw: unknown, organicRanks: unknown): StoredResultsTier {
  if (isRecord(raw) && Array.isArray(raw.organic_results)) return "full";
  if (organicRanks != null || raw != null) return "compact";
  return "none";
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
      CASE
        WHEN jsonb_typeof("raw"->'organic_results') = 'array' THEN 'full'
        WHEN "organicRanks" IS NOT NULL OR jsonb_typeof("raw") NOT IN ('null') THEN 'compact'
        ELSE 'none'
      END AS tier,
      (SELECT max((e->>'rank')::int) FROM jsonb_array_elements("raw"->'organic_results') e) AS retrieved,
      ("raw"->'normalization'->>'outcome' = 'match') AS "stoppedAtResult"
    FROM "rank_checks" rc
    JOIN "keywords" k ON k."id" = rc."keywordId"
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
      ("raw"->'normalization'->>'outcome' = 'match') AS "stoppedAtResult"
    FROM "rank_checks" rc
    JOIN "keywords" k ON k."id" = rc."keywordId"
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
      position: true,
      provider: true,
      publicId: true,
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

  return checks.map((check) => {
    const tier = classifyTier(check.raw, check.organicRanks);
    const base = {
      checkId: check.publicId,
      checkedAt: check.checkedAt.toISOString(),
      provider: check.provider,
      providerLabel: providerLabel(check.provider),
    };

    if (tier === "full") {
      const features = normalizeFeatures(check.raw);
      const retrievedPositions = maxRankFromRaw(check.raw) ?? 0;
      return buildFullResult(check, features, retrievedPositions, retentionDays);
    }

    if (tier === "compact") {
      return buildCompactResult(check, retentionDays);
    }

    return { ...base, tier: "none" as const };
  });
}
