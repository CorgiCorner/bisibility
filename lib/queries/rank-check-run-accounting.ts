import "server-only";

import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
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

const aggregateColumns = Prisma.raw(`
  COUNT(*)::int AS "receiptCount",
  COUNT(DISTINCT COALESCE(e.provider, 'unknown'))::int AS "providerCount",
  MIN(e.provider) AS "unitProvider",
  COUNT(*) FILTER (WHERE e."measurementStatus" <> 'recorded')::int AS "unconfirmedCount",
  COUNT(*) FILTER (
    WHERE e."measurementStatus" = 'recorded' AND e."usageQuantity" IS NULL
  )::int AS "unmeasuredCount",
  COALESCE(
    SUM(e."costCents") FILTER (WHERE e."measurementStatus" = 'recorded'), 0
  ) AS "recordedCostCents",
  COALESCE(
    SUM(e."usageQuantity") FILTER (
      WHERE e."measurementStatus" = 'recorded' AND e."usageQuantity" IS NOT NULL
    ),
    0
  ) AS "recordedUnits"
`);

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
 * Confirmed rank-check spend and native usage per run, read from the provider
 * cost ledger instead of per-check columns. A receipt counts as confirmed when
 * its measurement settled ("recorded"); any unsettled receipt makes the whole
 * scope unconfirmed instead of partially summed. Cached receipts are actual
 * zero and stay out of both the sums and the coverage decision, while an
 * explicitly recorded zero is retained.
 */
export async function rankCheckRunLedgerActuals(
  projectId: string,
  runIds: readonly string[],
  client: AccountingClient = prisma,
): Promise<Map<string, RunLedgerActual>> {
  if (runIds.length === 0) return new Map();
  const rows = await client.$queryRaw<LedgerAggregateRow[]>(Prisma.sql`
    SELECT c."scopeId" AS "scopeId", ${aggregateColumns}
    FROM "provider_cost_entries" e
    JOIN (
      SELECT id AS "correlationId", "runId" AS "scopeId"
      FROM "rank_checks"
      WHERE "runId" IN (${Prisma.join(runIds)})
      UNION
      SELECT t.id AS "correlationId", rc."runId" AS "scopeId"
      FROM "queued_rank_check_tasks" t
      JOIN "rank_checks" rc ON rc.id = t."rankCheckId"
      WHERE rc."runId" IN (${Prisma.join(runIds)})
    ) c ON c."correlationId" = e."correlationId"
    WHERE e."projectId" = ${projectId}
      AND e."feature" = 'rank_check'
      AND e."cached" = false
    GROUP BY c."scopeId"
  `);
  return byScope(rows);
}

/**
 * Confirmed ledger spend and usage for arbitrary rank checks, keyed by the
 * internal rank-check id. Live attempts correlate by the rank-check id and
 * queued attempts by their task id; the native request identity index already
 * keeps a receipt from appearing for both, so the two correlations only add up.
 */
export async function rankCheckLedgerActuals(
  projectId: string,
  checkIds: readonly string[],
  client: AccountingClient = prisma,
): Promise<Map<string, RunLedgerActual>> {
  if (checkIds.length === 0) return new Map();
  const rows = await client.$queryRaw<LedgerAggregateRow[]>(Prisma.sql`
    SELECT c."scopeId" AS "scopeId", ${aggregateColumns}
    FROM "provider_cost_entries" e
    JOIN (
      SELECT id AS "correlationId", id AS "scopeId"
      FROM "rank_checks"
      WHERE id IN (${Prisma.join(checkIds)})
      UNION
      SELECT t.id AS "correlationId", t."rankCheckId" AS "scopeId"
      FROM "queued_rank_check_tasks" t
      WHERE t."rankCheckId" IN (${Prisma.join(checkIds)})
    ) c ON c."correlationId" = e."correlationId"
    WHERE e."projectId" = ${projectId}
      AND e."feature" = 'rank_check'
      AND e."cached" = false
    GROUP BY c."scopeId"
  `);
  return byScope(rows);
}

/**
 * Confirmed ledger spend and usage per rank-check target of one run, keyed by
 * the internal rank-check id. Live attempts correlate by the rank-check id and
 * queued attempts by their task id; the native request identity index already
 * keeps a receipt from appearing for both, so the two correlations only add up.
 */
export async function rankCheckRunTargetLedgerActuals(
  projectId: string,
  runId: string,
  client: AccountingClient = prisma,
): Promise<Map<string, RunLedgerActual>> {
  const rows = await client.$queryRaw<LedgerAggregateRow[]>(Prisma.sql`
    SELECT c."scopeId" AS "scopeId", ${aggregateColumns}
    FROM "provider_cost_entries" e
    JOIN (
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
      AND e."cached" = false
    GROUP BY c."scopeId"
  `);
  return byScope(rows);
}

/**
 * Ledger-first actual cost. Runs predating the ledger keep their explicitly
 * measured stored cost; once any receipt exists the ledger decides, including
 * its unconfirmed null.
 */
export function ledgerActualCostCents(
  ledger: RunLedgerActual | undefined,
  storedCostCents: number | null,
): number | null {
  return ledger && ledger.receiptCount > 0 ? ledger.costCents : storedCostCents;
}

/** Ledger-first actual native units for one target. */
export function ledgerActualUnits(
  ledger: RunLedgerActual | undefined,
  storedUnits: number | null,
  provider?: string,
): number | null {
  if (!ledger || ledger.receiptCount === 0) return storedUnits;
  return provider && ledger.unitProvider !== provider ? null : ledger.units;
}
