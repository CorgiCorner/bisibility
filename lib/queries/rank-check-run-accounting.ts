import "server-only";

import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { canonicalUsageSql } from "@/lib/metering/usage-sql";
import type { RunLedgerActual } from "@/lib/rank-check/runs/usage";

export type { RunLedgerActual };

type AccountingClient = { $queryRaw: Prisma.TransactionClient["$queryRaw"] };

type LedgerAggregateRow = {
  receiptCount: number;
  providerCount: number;
  unitProvider: string | null;
  recordedCostCents: unknown;
  recordedUnits: unknown;
  scopeId: string;
  unconfirmedCount: number;
  unmeasuredCount: number;
};

function aggregateColumns() {
  const confirmed = `(e."measurementStatus" = 'recorded' AND
    (e.cached = false OR (e."costCents" = 0 AND e."usageQuantity" = 0)))`;
  return Prisma.raw(`
  COUNT(*)::int AS "receiptCount",
  COUNT(DISTINCT COALESCE(e.provider, 'unknown'))::int AS "providerCount",
  MIN(e.provider) AS "unitProvider",
  COUNT(*) FILTER (WHERE NOT COALESCE(${confirmed}, false))::int AS "unconfirmedCount",
  COUNT(*) FILTER (
    WHERE ${confirmed} AND e."usageQuantity" IS NULL
  )::int AS "unmeasuredCount",
  COALESCE(
    SUM(e."costCents") FILTER (WHERE ${confirmed}), 0
  ) AS "recordedCostCents",
  COALESCE(
    SUM(e."usageQuantity") FILTER (
      WHERE ${confirmed} AND e."usageQuantity" IS NOT NULL
    ),
    0
  ) AS "recordedUnits"
`);
}

function toLedgerActual(row: LedgerAggregateRow): RunLedgerActual {
  const unconfirmed = row.unconfirmedCount > 0;
  return {
    costCents: unconfirmed ? null : Number(row.recordedCostCents ?? 0),
    receiptCount: row.receiptCount,
    unitProvider: row.providerCount > 1 ? null : row.unitProvider,
    unconfirmedCount: row.unconfirmedCount,
    units:
      unconfirmed || row.unmeasuredCount > 0 || row.providerCount > 1
        ? null
        : Number(row.recordedUnits ?? 0),
  };
}

function byScope(rows: readonly LedgerAggregateRow[]) {
  const map = new Map<string, RunLedgerActual>();
  for (const row of rows) map.set(row.scopeId, toLedgerActual(row));
  return map;
}

/**
 * Confirmed provider spend and native usage per run, never customer charges or
 * stored per-check amounts. Unsettled receipts make the entire scope unknown.
 * Cached receipts establish zero coverage only with measured zero cost and
 * native units; incomplete or inconsistent cache evidence stays unconfirmed.
 */
export async function rankCheckRunLedgerActuals(
  projectId: string,
  runIds: readonly string[],
  client: AccountingClient = prisma,
): Promise<Map<string, RunLedgerActual>> {
  if (runIds.length === 0) return new Map();
  const rows = await client.$queryRaw<LedgerAggregateRow[]>(Prisma.sql`
    SELECT COALESCE(e."rankCheckRunId",c."scopeId") AS "scopeId", ${aggregateColumns()}
    FROM (${canonicalUsageSql()}) e
    LEFT JOIN (
      SELECT id AS "correlationId", "runId" AS "scopeId"
      FROM "rank_checks"
      WHERE "runId" = ANY(${runIds}::text[])
      UNION
      SELECT t.id AS "correlationId", rc."runId" AS "scopeId"
      FROM "queued_rank_check_tasks" t
      JOIN "rank_checks" rc ON rc.id = t."rankCheckId"
      WHERE rc."runId" = ANY(${runIds}::text[])
    ) c ON c."correlationId" = e."correlationId"
    WHERE e."projectId" = ${projectId}
      AND e."feature" = 'rank_check'
      AND COALESCE(e."rankCheckRunId",c."scopeId") = ANY(${runIds}::text[])
    GROUP BY COALESCE(e."rankCheckRunId",c."scopeId")
  `);
  return byScope(rows);
}

/**
 * Confirmed ledger spend and usage for arbitrary rank checks, keyed by the
 * internal rank-check id. Live attempts correlate by the rank-check id and
 * queued attempts by their task id; the native request identity index already
 * keeps a receipt from appearing for both, so the two correlations only add up.
 * Cached checks establish zero coverage only with measured zero cost and units;
 * incomplete or inconsistent cache evidence leaves the check unconfirmed.
 */
export async function rankCheckLedgerActuals(
  projectId: string,
  checkIds: readonly string[],
  client: AccountingClient = prisma,
): Promise<Map<string, RunLedgerActual>> {
  if (checkIds.length === 0) return new Map();
  const rows = await client.$queryRaw<LedgerAggregateRow[]>(Prisma.sql`
    SELECT COALESCE(e."rankCheckId",c."scopeId") AS "scopeId", ${aggregateColumns()}
    FROM (${canonicalUsageSql()}) e
    LEFT JOIN (
      SELECT id AS "correlationId", id AS "scopeId"
      FROM "rank_checks"
      WHERE id = ANY(${checkIds}::text[])
      UNION
      SELECT t.id AS "correlationId", t."rankCheckId" AS "scopeId"
      FROM "queued_rank_check_tasks" t
      WHERE t."rankCheckId" = ANY(${checkIds}::text[])
    ) c ON c."correlationId" = e."correlationId"
    WHERE e."projectId" = ${projectId}
      AND e."feature" = 'rank_check'
      AND COALESCE(e."rankCheckId",c."scopeId") = ANY(${checkIds}::text[])
    GROUP BY COALESCE(e."rankCheckId",c."scopeId")
  `);
  return byScope(rows);
}

/**
 * Confirmed ledger spend and usage per rank-check target of one run, keyed by
 * the internal rank-check id. Live attempts correlate by the rank-check id and
 * queued attempts by their task id; the native request identity index already
 * keeps a receipt from appearing for both, so the two correlations only add up.
 * Cached receipts use the same measured-zero and uncertainty rules as runs and
 * arbitrary checks; cached status alone does not establish a known amount.
 */
export async function rankCheckRunTargetLedgerActuals(
  projectId: string,
  runId: string,
  client: AccountingClient = prisma,
): Promise<Map<string, RunLedgerActual>> {
  const rows = await client.$queryRaw<LedgerAggregateRow[]>(Prisma.sql`
    SELECT COALESCE(e."rankCheckId",c."scopeId") AS "scopeId", ${aggregateColumns()}
    FROM (${canonicalUsageSql()}) e
    LEFT JOIN (
      SELECT id AS "correlationId", id AS "scopeId"
      FROM "rank_checks"
      WHERE "runId" = ${runId}
      UNION
      SELECT t.id AS "correlationId", t."rankCheckId" AS "scopeId"
      FROM "queued_rank_check_tasks" t
      JOIN "rank_checks" rc ON rc.id = t."rankCheckId"
      WHERE rc."runId" = ${runId}
    ) c ON c."correlationId" = e."correlationId"
    WHERE e."projectId" = ${projectId}
      AND e."feature" = 'rank_check'
      AND (e."rankCheckRunId"=${runId} OR c."scopeId" IS NOT NULL)
    GROUP BY COALESCE(e."rankCheckId",c."scopeId")
  `);
  return byScope(rows);
}

/** Canonical actual cost; missing or uncertain receipts never use stored business amounts. */
export function ledgerActualCostCents(
  ledger: RunLedgerActual | undefined,
  _storedCostCents: number | null,
): number | null {
  return ledger && ledger.receiptCount > 0 ? ledger.costCents : null;
}

/** Ledger-first actual native units for one target. */
export function ledgerActualUnits(
  ledger: RunLedgerActual | undefined,
  _storedUnits: number | null,
  provider?: string,
): number | null {
  if (!ledger || ledger.receiptCount === 0) return null;
  return provider && ledger.unitProvider !== provider ? null : ledger.units;
}
