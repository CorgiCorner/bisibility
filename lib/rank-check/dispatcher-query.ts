import { Prisma } from "@/lib/generated/prisma/client";
import type { RankCheckScheduleInput } from "./schedule";

export type DispatchRow = {
  anchorCheckAt: Date | null;
  cronExpression: string | null;
  device: string;
  domain: string;
  dueCheckAt: Date;
  frequency: RankCheckScheduleInput["frequency"];
  jitterMinutes: number;
  keywordId: string;
  locationId: string;
  projectId: string;
  timezone: string;
};

export type DispatchTransaction = Pick<Prisma.TransactionClient, "$executeRaw" | "$queryRaw">;

export type StateAdvance = {
  advancedCheckAt: Date;
  dueCheckAt: Date;
  keywordId: string;
};

const effectiveFrequency = Prisma.sql`
  (CASE
    WHEN ks.id IS NOT NULL THEN ks.frequency
    ELSE pd.frequency
  END)::text
`;

const automaticFrequencyFilter = Prisma.sql`
  ${effectiveFrequency} IN ('daily', 'weekly', 'monthly', 'custom_cron')
`;

export async function oldestEligibleDueAt(tx: DispatchTransaction, now: Date) {
  const rows = await tx.$queryRaw<Array<{ nextCheckAt: Date }>>(Prisma.sql`
    SELECT state."nextCheckAt"
    FROM "keyword_dispatch_states" state
    JOIN "keywords" k ON k.id = state."keywordId"
    JOIN "projects" p ON p.id = k."projectId"
    JOIN "users" owner ON owner.id = p."ownerId"
    LEFT JOIN "keyword_schedules" ks ON ks."keywordId" = k.id
    LEFT JOIN "project_defaults" pd ON pd."projectId" = k."projectId"
    WHERE state."nextCheckAt" <= ${now}
      AND owner."deactivatedAt" IS NULL
      AND p."writeMode" = 'active'
      AND ${automaticFrequencyFilter}
    ORDER BY state."nextCheckAt", state."keywordId"
    LIMIT 1
  `);
  return rows[0]?.nextCheckAt ?? null;
}

export function fairDueStatesSql(now: Date, pageSize: number, perProjectCap: number) {
  return Prisma.sql`
    WITH due_range AS MATERIALIZED (
      SELECT state."keywordId", state."nextCheckAt"
      FROM "keyword_dispatch_states" state
      WHERE state."nextCheckAt" <= ${now}
      ORDER BY state."nextCheckAt", state."keywordId"
    ),
    eligible_due AS MATERIALIZED (
      SELECT
        due."keywordId",
        due."nextCheckAt",
        k."projectId",
        ROW_NUMBER() OVER (
          PARTITION BY k."projectId"
          ORDER BY due."nextCheckAt", due."keywordId"
        ) AS "projectRank"
      FROM due_range due
      JOIN "keywords" k ON k.id = due."keywordId"
      JOIN "projects" p ON p.id = k."projectId"
      JOIN "users" owner ON owner.id = p."ownerId"
      LEFT JOIN "keyword_schedules" ks ON ks."keywordId" = k.id
      LEFT JOIN "project_defaults" pd ON pd."projectId" = k."projectId"
      WHERE owner."deactivatedAt" IS NULL
        AND p."writeMode" = 'active'
        AND ${automaticFrequencyFilter}
    ),
    fair_candidates AS MATERIALIZED (
      SELECT "keywordId", "nextCheckAt", "projectId", "projectRank"
      FROM eligible_due
      WHERE "projectRank" <= ${perProjectCap}
      ORDER BY "projectRank", "nextCheckAt", "projectId", "keywordId"
      LIMIT ${pageSize}
    ),
    locked AS MATERIALIZED (
      SELECT
        state."keywordId",
        candidate."nextCheckAt" AS "dueCheckAt",
        candidate."projectId",
        candidate."projectRank"
      FROM fair_candidates candidate
      JOIN "keyword_dispatch_states" state ON state."keywordId" = candidate."keywordId"
      ORDER BY
        candidate."projectRank",
        candidate."nextCheckAt",
        candidate."projectId",
        candidate."keywordId"
      FOR UPDATE OF state SKIP LOCKED
    )
    SELECT
      locked."keywordId",
      locked."dueCheckAt",
      locked."projectId",
      k."locationId",
      k.device::text AS device,
      p.domain,
      ${effectiveFrequency} AS frequency,
      CASE WHEN ks.id IS NOT NULL THEN ks."cronExpression" ELSE pd."cronExpression" END
        AS "cronExpression",
      CASE WHEN ks.id IS NOT NULL THEN ks.timezone ELSE pd.timezone END AS timezone,
      CASE WHEN ks.id IS NOT NULL THEN ks."jitterMinutes" ELSE pd."jitterMinutes" END
        AS "jitterMinutes",
      CASE WHEN ks.id IS NOT NULL THEN ks."nextCheckAt" ELSE pd."nextCheckAt" END
        AS "anchorCheckAt"
    FROM locked
    JOIN "keywords" k ON k.id = locked."keywordId"
    JOIN "projects" p ON p.id = locked."projectId"
    LEFT JOIN "keyword_schedules" ks ON ks."keywordId" = k.id
    LEFT JOIN "project_defaults" pd ON pd."projectId" = k."projectId"
    ORDER BY
      locked."projectRank",
      locked."dueCheckAt",
      locked."projectId",
      locked."keywordId"
  `;
}

export async function selectFairDueStates(
  tx: DispatchTransaction,
  now: Date,
  pageSize: number,
  perProjectCap: number,
) {
  await tx.$executeRaw(Prisma.sql`SET LOCAL work_mem = '64MB'`);
  return tx.$queryRaw<DispatchRow[]>(fairDueStatesSql(now, pageSize, perProjectCap));
}

export async function advanceClaimedStates(tx: DispatchTransaction, advances: StateAdvance[]) {
  if (advances.length === 0) return new Map<string, string>();
  const values = Prisma.join(
    advances.map((advance) => {
      return Prisma.sql`(
        ${advance.keywordId}::text,
        ${advance.dueCheckAt}::timestamp(3),
        ${advance.advancedCheckAt}::timestamp(3)
      )`;
    }),
  );
  const updated = await tx.$queryRaw<Array<{ keywordId: string; stateVersion: string }>>(Prisma.sql`
    UPDATE "keyword_dispatch_states" state
    SET "nextCheckAt" = advance."advancedCheckAt"
    FROM (
      VALUES ${values}
    ) AS advance("keywordId", "dueCheckAt", "advancedCheckAt")
    WHERE state."keywordId" = advance."keywordId"
      AND state."nextCheckAt" = advance."dueCheckAt"
    RETURNING state."keywordId", state.xmin::text AS "stateVersion"
  `);
  if (updated.length !== advances.length) {
    throw new Error("A locked dispatcher state changed before due-time advancement.");
  }
  return new Map(updated.map((row) => [row.keywordId, row.stateVersion]));
}
