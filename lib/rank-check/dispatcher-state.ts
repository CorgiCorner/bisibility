import "server-only";

import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { computeDispatcherNextCheckAt } from "./dispatcher-recurrence";
import type { RankCheckScheduleInput } from "./schedule";
import { dispatcherStateHealingAllowed } from "./scheduler-mode";

const DEFAULT_PAGE_SIZE = 200;
const MAX_PAGE_SIZE = 500;

type StateRow = {
  anchorCheckAt: Date | null;
  cronExpression: string | null;
  frequency: RankCheckScheduleInput["frequency"];
  jitterMinutes: number;
  keywordId: string;
  timezone: string;
};

type StateTransaction = Pick<Prisma.TransactionClient, "$executeRaw" | "$queryRaw">;
type StateDatabase = {
  $transaction<T>(callback: (tx: StateTransaction) => Promise<T>): Promise<T>;
};
type StateClient = StateDatabase | StateTransaction;

const effectiveFrequency = Prisma.sql`
  (CASE WHEN ks.id IS NOT NULL THEN ks.frequency ELSE pd.frequency END)::text
`;
const automaticFrequencyFilter = Prisma.sql`
  ${effectiveFrequency} IN ('daily', 'weekly', 'monthly', 'custom_cron')
`;

function boundedPageSize(pageSize?: number) {
  if (!Number.isFinite(pageSize)) return DEFAULT_PAGE_SIZE;
  return Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(pageSize ?? DEFAULT_PAGE_SIZE)));
}

function withStateTransaction<T>(
  database: StateClient,
  callback: (tx: StateTransaction) => Promise<T>,
) {
  return "$transaction" in database ? database.$transaction(callback) : callback(database);
}

function scheduleFromRow(row: StateRow): RankCheckScheduleInput {
  return {
    cronExpression: row.cronExpression,
    frequency: row.frequency,
    jitterMinutes: row.jitterMinutes,
    nextCheckAt: row.anchorCheckAt,
    timezone: row.timezone,
  };
}

async function insertRows(tx: StateTransaction, rows: StateRow[], now: Date) {
  for (let offset = 0; offset < rows.length; offset += MAX_PAGE_SIZE) {
    const values = rows.slice(offset, offset + MAX_PAGE_SIZE).map((row) => {
      const nextCheckAt = computeDispatcherNextCheckAt(scheduleFromRow(row), row.keywordId, now);
      return Prisma.sql`(${row.keywordId}, ${nextCheckAt})`;
    });
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "keyword_dispatch_states" ("keywordId", "nextCheckAt")
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("keywordId") DO UPDATE SET "nextCheckAt" = EXCLUDED."nextCheckAt"
    `);
  }
  return rows.length;
}

function stateRowSelect(target: Prisma.Sql) {
  return Prisma.sql`
    SELECT
      k.id AS "keywordId",
      ${effectiveFrequency} AS frequency,
      CASE WHEN ks.id IS NOT NULL THEN ks."cronExpression" ELSE pd."cronExpression" END
        AS "cronExpression",
      CASE WHEN ks.id IS NOT NULL THEN ks.timezone ELSE pd.timezone END AS timezone,
      CASE WHEN ks.id IS NOT NULL THEN ks."jitterMinutes" ELSE pd."jitterMinutes" END
        AS "jitterMinutes",
      CASE WHEN ks.id IS NOT NULL THEN ks."nextCheckAt" ELSE pd."nextCheckAt" END
        AS "anchorCheckAt"
    FROM "keywords" k
    LEFT JOIN "keyword_schedules" ks ON ks."keywordId" = k.id
    LEFT JOIN "project_defaults" pd ON pd."projectId" = k."projectId"
    WHERE ${target}
      AND ${automaticFrequencyFilter}
    ORDER BY k.id
  `;
}

export async function seedKeywordDispatchStates(
  keywordIds: readonly string[],
  options: { now?: Date } = {},
  database: StateClient = prisma,
) {
  if (!dispatcherStateHealingAllowed() || keywordIds.length === 0) return 0;
  const now = options.now ?? new Date();
  return withStateTransaction(database, async (tx) => {
    const rows = await tx.$queryRaw<StateRow[]>(
      stateRowSelect(Prisma.sql`k.id IN (${Prisma.join(keywordIds)})`),
    );
    return insertRows(tx, rows, now);
  });
}

type RefreshTarget =
  | { inheritedProjectId: string; keywordIds?: never; now?: Date }
  | { inheritedProjectId?: never; keywordIds: readonly string[]; now?: Date };

export async function refreshKeywordDispatchStates(
  target: RefreshTarget,
  database: StateClient = prisma,
) {
  if (!dispatcherStateHealingAllowed()) return 0;
  const keywordIds = target.keywordIds;
  if (keywordIds?.length === 0) return 0;
  const now = target.now ?? new Date();

  return withStateTransaction(database, async (tx) => {
    const filter =
      keywordIds !== undefined
        ? Prisma.sql`k.id IN (${Prisma.join(keywordIds)})`
        : Prisma.sql`k."projectId" = ${target.inheritedProjectId} AND ks.id IS NULL`;
    if (keywordIds !== undefined) {
      await tx.$executeRaw(Prisma.sql`
        DELETE FROM "keyword_dispatch_states"
        WHERE "keywordId" IN (${Prisma.join(keywordIds)})
      `);
    } else {
      await tx.$executeRaw(Prisma.sql`
        DELETE FROM "keyword_dispatch_states" state
        USING "keywords" k
        LEFT JOIN "keyword_schedules" ks ON ks."keywordId" = k.id
        WHERE state."keywordId" = k.id
          AND k."projectId" = ${target.inheritedProjectId}
          AND ks.id IS NULL
      `);
    }
    const rows = await tx.$queryRaw<StateRow[]>(stateRowSelect(filter));
    return insertRows(tx, rows, now);
  });
}

export type DispatchBackfillResult = {
  cursor: string | null;
  done: boolean;
  seeded: number;
};

export async function backfillKeywordDispatchStates(
  options: { cursor?: string | null; now?: Date; pageSize?: number } = {},
  database: StateClient = prisma,
): Promise<DispatchBackfillResult> {
  const cursor = options.cursor ?? null;
  if (!dispatcherStateHealingAllowed()) return { cursor, done: true, seeded: 0 };
  const now = options.now ?? new Date();
  const pageSize = boundedPageSize(options.pageSize);

  return withStateTransaction(database, async (tx) => {
    const rows = await tx.$queryRaw<StateRow[]>(Prisma.sql`
      SELECT
        k.id AS "keywordId",
        ${effectiveFrequency} AS frequency,
        CASE WHEN ks.id IS NOT NULL THEN ks."cronExpression" ELSE pd."cronExpression" END
          AS "cronExpression",
        CASE WHEN ks.id IS NOT NULL THEN ks.timezone ELSE pd.timezone END AS timezone,
        CASE WHEN ks.id IS NOT NULL THEN ks."jitterMinutes" ELSE pd."jitterMinutes" END
          AS "jitterMinutes",
        CASE WHEN ks.id IS NOT NULL THEN ks."nextCheckAt" ELSE pd."nextCheckAt" END
          AS "anchorCheckAt"
      FROM "keywords" k
      JOIN "projects" p ON p.id = k."projectId"
      JOIN "users" owner ON owner.id = p."ownerId"
      LEFT JOIN "keyword_schedules" ks ON ks."keywordId" = k.id
      LEFT JOIN "project_defaults" pd ON pd."projectId" = k."projectId"
      LEFT JOIN "keyword_dispatch_states" state ON state."keywordId" = k.id
      WHERE state."keywordId" IS NULL
        AND (${cursor}::text IS NULL OR k.id > ${cursor})
        AND owner."deactivatedAt" IS NULL
        AND p."writeMode" = 'active'
        AND ${automaticFrequencyFilter}
      ORDER BY k.id
      FOR UPDATE OF k SKIP LOCKED
      LIMIT ${pageSize}
    `);
    const seeded = await insertRows(tx, rows, now);
    return {
      cursor: rows.at(-1)?.keywordId ?? cursor,
      done: rows.length < pageSize,
      seeded,
    };
  });
}
