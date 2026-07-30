import "server-only";

import { createHash } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { dispatcherNextCheckAtMatchesRecurrence } from "./dispatcher-recurrence";
import { dispatcherEffectiveFrequency, dispatcherEligibleFilter } from "./dispatcher-state-sql";
import type { RankCheckScheduleInput } from "./schedule";

const PAGE_SIZE = 500;

type RecurrenceRow = {
  anchorCheckAt: Date | null;
  cronExpression: string | null;
  frequency: RankCheckScheduleInput["frequency"];
  jitterMinutes: number;
  keywordId: string;
  nextCheckAt: Date;
  timezone: string;
};

type RecurrenceDatabase = Pick<typeof prisma, "$queryRaw">;

function schedule(row: RecurrenceRow): RankCheckScheduleInput {
  return {
    cronExpression: row.cronExpression,
    frequency: row.frequency,
    jitterMinutes: row.jitterMinutes,
    nextCheckAt: row.anchorCheckAt,
    timezone: row.timezone,
  };
}

function fingerprintRow(row: RecurrenceRow) {
  return [
    row.keywordId,
    row.frequency,
    row.cronExpression ?? "",
    row.timezone,
    String(row.jitterMinutes),
    row.anchorCheckAt?.toISOString() ?? "",
    row.nextCheckAt.toISOString(),
  ].join("\0");
}

async function scan(database: RecurrenceDatabase, referenceAt: Date) {
  const hash = createHash("sha256");
  let cursor: string | null = null;
  let mismatches = 0;
  let scanned = 0;

  while (true) {
    const rows: RecurrenceRow[] = await database.$queryRaw<RecurrenceRow[]>(Prisma.sql`
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
      JOIN "keyword_dispatch_states" state ON state."keywordId" = k.id
      LEFT JOIN "keyword_schedules" ks ON ks."keywordId" = k.id
      LEFT JOIN "project_defaults" pd ON pd."projectId" = k."projectId"
      WHERE (${cursor}::text IS NULL OR k.id > ${cursor})
        AND ${dispatcherEligibleFilter}
      ORDER BY k.id
      LIMIT ${PAGE_SIZE}
    `);
    for (const row of rows) {
      scanned += 1;
      hash.update(fingerprintRow(row));
      hash.update("\n");
      if (
        !dispatcherNextCheckAtMatchesRecurrence(
          schedule(row),
          row.keywordId,
          row.nextCheckAt,
          referenceAt,
        )
      ) {
        mismatches += 1;
      }
    }
    cursor = rows.at(-1)?.keywordId ?? cursor;
    if (rows.length < PAGE_SIZE) break;
  }

  return { fingerprint: hash.digest("hex"), mismatches, scanned };
}

export async function measureDispatcherStateRecurrenceCoverage(
  referenceAt = new Date(),
  database: RecurrenceDatabase = prisma,
) {
  const first = await scan(database, referenceAt);
  const second = await scan(database, referenceAt);
  return {
    mismatches: second.mismatches,
    scanned: second.scanned,
    stable:
      first.fingerprint === second.fingerprint &&
      first.mismatches === second.mismatches &&
      first.scanned === second.scanned,
  };
}
