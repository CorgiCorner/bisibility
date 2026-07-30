import "server-only";

import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { computeDispatcherNextCheckAt } from "./dispatcher-recurrence";
import { dispatcherStateCountsEqual, readDispatcherStateCounts } from "./dispatcher-state-counts";
import { measureDispatcherStateRecurrenceCoverage } from "./dispatcher-state-recurrence-coverage";
import { dispatcherEffectiveFrequency, dispatcherEligibleFilter } from "./dispatcher-state-sql";
import type { RankCheckScheduleInput } from "./schedule";

const MAX_PAGE_SIZE = 500;

type StateRow = {
  anchorCheckAt: Date | null;
  cronExpression: string | null;
  frequency: RankCheckScheduleInput["frequency"];
  keywordId: string;
  nextCheckAt: Date | null;
  jitterMinutes: number;
  timezone: string;
};

type StateTransaction = Pick<Prisma.TransactionClient, "$executeRaw" | "$queryRaw">;
export type DispatcherStateDatabase = {
  $transaction<T>(callback: (tx: StateTransaction) => Promise<T>): Promise<T>;
};

export type DispatcherStateCoverage = {
  coverageCountsStable: boolean;
  eligible: number;
  eligibleWithState: number;
  exact: boolean;
  gone: number;
  ineligible: number;
  maxNextCheckAt: string | null;
  minNextCheckAt: string | null;
  missing: number;
  oldestDueLagMs: number;
  recurrenceMismatches: number;
  recurrenceScanRows: number;
  recurrenceScanStable: boolean;
};

export type DispatcherStatePageResult = {
  cursor: string | null;
  done: boolean;
  inserted: number;
  removed: number;
  selected: number;
  skippedLocked: number;
  unchanged: number;
  updated: number;
};

function pageSize(value: number) {
  if (!Number.isInteger(value) || value < 1 || value > MAX_PAGE_SIZE) {
    throw new Error(`pageSize must be an integer from 1 through ${MAX_PAGE_SIZE}`);
  }
  return value;
}

function eligibleRows(target: Prisma.Sql, lock: boolean, limit?: number) {
  return Prisma.sql`
    SELECT
      k.id AS "keywordId",
      ${dispatcherEffectiveFrequency} AS frequency,
      CASE WHEN ks.id IS NOT NULL THEN ks."cronExpression" ELSE pd."cronExpression" END
        AS "cronExpression",
      CASE WHEN ks.id IS NOT NULL THEN ks.timezone ELSE pd.timezone END AS timezone,
      CASE WHEN ks.id IS NOT NULL THEN ks."jitterMinutes" ELSE pd."jitterMinutes" END
        AS "jitterMinutes",
      CASE WHEN ks.id IS NOT NULL THEN ks."nextCheckAt" ELSE pd."nextCheckAt" END
        AS "anchorCheckAt",
      state."nextCheckAt"
    FROM "keywords" k
    JOIN "projects" p ON p.id = k."projectId"
    JOIN "users" owner ON owner.id = p."ownerId"
    LEFT JOIN "keyword_schedules" ks ON ks."keywordId" = k.id
    LEFT JOIN "project_defaults" pd ON pd."projectId" = k."projectId"
    LEFT JOIN "keyword_dispatch_states" state ON state."keywordId" = k.id
    WHERE ${target} AND ${dispatcherEligibleFilter}
    ORDER BY k.id
    ${lock ? Prisma.sql`FOR UPDATE OF k SKIP LOCKED` : Prisma.empty}
    ${limit === undefined ? Prisma.empty : Prisma.sql`LIMIT ${limit}`}
  `;
}

function schedule(row: StateRow): RankCheckScheduleInput {
  return {
    cronExpression: row.cronExpression,
    frequency: row.frequency,
    jitterMinutes: row.jitterMinutes,
    nextCheckAt: row.anchorCheckAt,
    timezone: row.timezone,
  };
}

function ineligibleRows(target: Prisma.Sql, lock: boolean, limit?: number) {
  return Prisma.sql`
    SELECT state."keywordId"
    FROM "keyword_dispatch_states" state
    LEFT JOIN "keywords" k ON k.id = state."keywordId"
    LEFT JOIN "projects" p ON p.id = k."projectId"
    LEFT JOIN "users" owner ON owner.id = p."ownerId"
    LEFT JOIN "keyword_schedules" ks ON ks."keywordId" = k.id
    LEFT JOIN "project_defaults" pd ON pd."projectId" = k."projectId"
    WHERE ${target} AND (k.id IS NULL OR NOT COALESCE((${dispatcherEligibleFilter}), false))
    ORDER BY state."keywordId"
    ${lock ? Prisma.sql`FOR UPDATE OF state SKIP LOCKED` : Prisma.empty}
    ${limit === undefined ? Prisma.empty : Prisma.sql`LIMIT ${limit}`}
  `;
}

export async function healDispatcherStatePage(
  options: {
    cursor?: string | null;
    dryRun: boolean;
    pageSize: number;
    reconcileAt: Date;
  },
  database: DispatcherStateDatabase = prisma,
): Promise<DispatcherStatePageResult> {
  const limit = pageSize(options.pageSize);
  const cursor = options.cursor ?? null;
  return database.$transaction(async (tx) => {
    const candidates = await tx.$queryRaw<StateRow[]>(
      eligibleRows(Prisma.sql`(${cursor}::text IS NULL OR k.id > ${cursor})`, false, limit),
    );
    const ids = candidates.map((row) => row.keywordId);
    const selected = candidates.length;
    if (selected === 0) {
      return {
        cursor,
        done: true,
        inserted: 0,
        removed: 0,
        selected: 0,
        skippedLocked: 0,
        unchanged: 0,
        updated: 0,
      };
    }
    const rows = options.dryRun
      ? candidates
      : await tx.$queryRaw<StateRow[]>(
          eligibleRows(Prisma.sql`k.id IN (${Prisma.join(ids)})`, true),
        );
    let inserted = 0;
    let unchanged = 0;
    let updated = 0;
    const changes: Array<{ keywordId: string; nextCheckAt: Date }> = [];
    for (const row of rows) {
      const expected = computeDispatcherNextCheckAt(
        schedule(row),
        row.keywordId,
        options.reconcileAt,
      );
      if (!row.nextCheckAt) inserted += 1;
      else if (row.nextCheckAt.getTime() !== expected.getTime()) updated += 1;
      else unchanged += 1;
      if (!row.nextCheckAt || row.nextCheckAt.getTime() !== expected.getTime()) {
        changes.push({ keywordId: row.keywordId, nextCheckAt: expected });
      }
    }
    if (!options.dryRun && changes.length > 0) {
      const values = changes.map(
        (change) => Prisma.sql`(${change.keywordId}, ${change.nextCheckAt})`,
      );
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "keyword_dispatch_states" ("keywordId", "nextCheckAt")
        VALUES ${Prisma.join(values)}
        ON CONFLICT ("keywordId") DO UPDATE SET "nextCheckAt" = EXCLUDED."nextCheckAt"
      `);
    }
    return {
      cursor: candidates.at(-1)?.keywordId ?? cursor,
      done: selected < limit,
      inserted,
      removed: 0,
      selected,
      skippedLocked: selected - rows.length,
      unchanged,
      updated,
    };
  });
}

export async function removeIneligibleDispatcherStatePage(
  options: { cursor?: string | null; dryRun: boolean; pageSize: number },
  database: DispatcherStateDatabase = prisma,
): Promise<DispatcherStatePageResult> {
  const limit = pageSize(options.pageSize);
  const cursor = options.cursor ?? null;
  return database.$transaction(async (tx) => {
    const candidates = await tx.$queryRaw<Array<{ keywordId: string }>>(
      ineligibleRows(
        Prisma.sql`(${cursor}::text IS NULL OR state."keywordId" > ${cursor})`,
        false,
        limit,
      ),
    );
    const candidateIds = candidates.map((row) => row.keywordId);
    const rows =
      options.dryRun || candidateIds.length === 0
        ? candidates
        : await tx.$queryRaw<Array<{ keywordId: string }>>(
            ineligibleRows(Prisma.sql`state."keywordId" IN (${Prisma.join(candidateIds)})`, true),
          );
    const ids = rows.map((row) => row.keywordId);
    if (!options.dryRun && ids.length > 0) {
      await tx.$executeRaw(Prisma.sql`
        DELETE FROM "keyword_dispatch_states" WHERE "keywordId" IN (${Prisma.join(ids)})
      `);
    }
    return {
      cursor: candidates.at(-1)?.keywordId ?? cursor,
      done: candidates.length < limit,
      inserted: 0,
      removed: rows.length,
      selected: candidates.length,
      skippedLocked: candidates.length - rows.length,
      unchanged: 0,
      updated: 0,
    };
  });
}

export async function measureDispatcherStateCoverage(
  now = new Date(),
  database: Pick<StateTransaction, "$queryRaw"> = prisma,
): Promise<DispatcherStateCoverage> {
  const firstCounts = await readDispatcherStateCounts(database);
  const recurrence = await measureDispatcherStateRecurrenceCoverage(now, database);
  const row = await readDispatcherStateCounts(database);
  const coverageCountsStable = dispatcherStateCountsEqual(firstCounts, row);
  const min = row.minNextCheckAt;
  const oldestDueLagMs = min && min < now ? now.getTime() - min.getTime() : 0;
  const eligible = Number(row.eligible);
  const eligibleWithState = Number(row.eligibleWithState);
  const missing = Number(row.missing);
  const gone = Number(row.gone);
  const ineligible = Number(row.ineligible);
  return {
    coverageCountsStable,
    eligible,
    eligibleWithState,
    exact:
      eligible === eligibleWithState &&
      missing === 0 &&
      gone === 0 &&
      ineligible === 0 &&
      recurrence.mismatches === 0 &&
      recurrence.scanned === eligibleWithState &&
      recurrence.stable &&
      coverageCountsStable,
    gone,
    ineligible,
    maxNextCheckAt: row.maxNextCheckAt?.toISOString() ?? null,
    minNextCheckAt: min?.toISOString() ?? null,
    missing,
    oldestDueLagMs,
    recurrenceMismatches: recurrence.mismatches,
    recurrenceScanRows: recurrence.scanned,
    recurrenceScanStable: recurrence.stable,
  };
}
