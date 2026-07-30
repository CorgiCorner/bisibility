import "server-only";

import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import type { AlertTrendCheck } from "./downtrend";

type HistoryInput = {
  current: AlertTrendCheck;
  keywordId: string;
};

type RecentRankCheckRow = {
  checkedAt: Date;
  id: string;
  keywordId: string;
  position: number | null;
};

function appendCurrent(rows: AlertTrendCheck[], current: AlertTrendCheck) {
  if (!current.rankCheckId || rows.some((row) => row.rankCheckId === current.rankCheckId)) {
    return rows;
  }
  return [...rows, current]
    .sort((a, b) => (a.checkedAt?.getTime() ?? 0) - (b.checkedAt?.getTime() ?? 0))
    .slice(-5);
}

export async function loadRecentCompletedCheckHistories(inputs: HistoryInput[]) {
  const byKeyword = new Map(inputs.map((input) => [input.keywordId, [] as AlertTrendCheck[]]));
  const keywordIds = [...new Set(inputs.map((input) => input.keywordId))];
  if (keywordIds.length === 0) {
    return byKeyword;
  }

  const rows = await prisma.$queryRaw<RecentRankCheckRow[]>(Prisma.sql`
    SELECT "id", "keywordId", "checkedAt", "position"
    FROM (
      SELECT "id", "keywordId", "checkedAt", "position",
        row_number() OVER (PARTITION BY "keywordId" ORDER BY "checkedAt" DESC, "id" DESC) AS rn
      FROM "rank_checks"
      WHERE "status" = 'completed' AND "keywordId" IN (${Prisma.join(keywordIds)})
    ) AS ranked_checks
    WHERE rn <= 5
    ORDER BY "keywordId" ASC, "checkedAt" ASC, "id" ASC
  `);

  for (const row of rows) {
    byKeyword.get(row.keywordId)?.push({
      checkedAt: row.checkedAt,
      position: row.position,
      rankCheckId: row.id,
    });
  }
  for (const input of inputs) {
    byKeyword.set(
      input.keywordId,
      appendCurrent(byKeyword.get(input.keywordId) ?? [], input.current),
    );
  }

  return byKeyword;
}

export async function loadRecentCompletedChecks(keywordId: string, current: AlertTrendCheck) {
  const histories = await loadRecentCompletedCheckHistories([{ current, keywordId }]);
  return histories.get(keywordId) ?? [];
}
