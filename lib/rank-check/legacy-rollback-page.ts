import "server-only";

import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import type { SyncRankCheckScheduleInput } from "./temporal-schedule";

type RollbackRow = {
  cronExpression: string | null;
  frequency: SyncRankCheckScheduleInput["schedule"]["frequency"];
  jitterMinutes: number;
  keywordId: string;
  nextCheckAt: Date;
  projectId: string;
  timezone: string;
};

const effectiveFrequency = Prisma.sql`
  (CASE WHEN ks.id IS NOT NULL THEN ks.frequency ELSE pd.frequency END)::text
`;

export async function readLegacyRollbackPage(
  cursor: string | null,
  pageSize: number,
  database: Pick<typeof prisma, "$queryRaw"> = prisma,
) {
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 500) {
    throw new Error("pageSize must be an integer from 1 through 500.");
  }
  const rows = await database.$queryRaw<RollbackRow[]>(Prisma.sql`
    SELECT
      k.id AS "keywordId",
      k."projectId",
      ${effectiveFrequency} AS frequency,
      CASE WHEN ks.id IS NOT NULL THEN ks."cronExpression" ELSE pd."cronExpression" END
        AS "cronExpression",
      CASE WHEN ks.id IS NOT NULL THEN ks.timezone ELSE pd.timezone END AS timezone,
      CASE WHEN ks.id IS NOT NULL THEN ks."jitterMinutes" ELSE pd."jitterMinutes" END
        AS "jitterMinutes",
      state."nextCheckAt"
    FROM "keywords" k
    JOIN "projects" p ON p.id = k."projectId"
    JOIN "users" owner ON owner.id = p."ownerId"
    JOIN "keyword_dispatch_states" state ON state."keywordId" = k.id
    LEFT JOIN "keyword_schedules" ks ON ks."keywordId" = k.id
    LEFT JOIN "project_defaults" pd ON pd."projectId" = k."projectId"
    WHERE (${cursor}::text IS NULL OR k.id > ${cursor})
      AND owner."deactivatedAt" IS NULL
      AND p."writeMode" = 'active'
      AND ${effectiveFrequency} IN ('daily', 'weekly', 'monthly', 'custom_cron')
    ORDER BY k.id
    LIMIT ${pageSize}
  `);
  return {
    cursor: rows.at(-1)?.keywordId ?? cursor,
    done: rows.length < pageSize,
    rows: rows.map(
      (row): SyncRankCheckScheduleInput => ({
        keywordId: row.keywordId,
        projectId: row.projectId,
        schedule: {
          cronExpression: row.cronExpression,
          frequency: row.frequency,
          jitterMinutes: row.jitterMinutes,
          nextCheckAt: row.nextCheckAt,
          timezone: row.timezone,
        },
      }),
    ),
  };
}
