import "server-only";

import type { DeferredReason } from "@/lib/checks/contract";
import {
  buildProviderHealth,
  type CheckRunsSummary,
  type ProviderChainEntry,
} from "@/lib/checks/runs-view";
import { prisma } from "@/lib/db/prisma";

type SpendRow = { total: unknown };
type DeferredGroupRow = {
  count: number;
  firstAt: Date;
  keywordCount: number;
  lastAt: Date;
  reason: string;
};

type Range = {
  end: Date;
  start: Date;
};

function countFor(groups: readonly { _count: { _all: number }; status: string }[], status: string) {
  return groups.find((group) => group.status === status)?._count._all ?? 0;
}

function deferredGroups(rows: readonly DeferredGroupRow[]) {
  return rows.flatMap((row) => {
    if (
      row.reason !== "budget_exhausted" &&
      row.reason !== "migration_hold" &&
      row.reason !== "no_provider" &&
      row.reason !== "rate_limited"
    ) {
      return [];
    }
    return [
      {
        count: row.count,
        firstAt: row.firstAt.toISOString(),
        keywordCount: row.keywordCount,
        lastAt: row.lastAt.toISOString(),
        reason: row.reason as DeferredReason,
      },
    ];
  });
}

export async function loadCheckRunsSummary(
  projectId: string,
  range: Range,
  providerChain: Promise<readonly ProviderChainEntry[]>,
): Promise<CheckRunsSummary> {
  const scope = {
    checkedAt: { gte: range.start, lte: range.end },
    keyword: { projectId },
  };
  const [statusGroups, viaFallback, spendRows, deferredRows, completionGroups, attemptRows, chain] =
    await Promise.all([
      prisma.rankCheck.groupBy({
        _count: { _all: true },
        by: ["status"],
        where: scope,
      }),
      prisma.rankCheck.count({
        where: { ...scope, viaFallback: true },
      }),
      prisma.$queryRaw<SpendRow[]>`
      SELECT COALESCE(SUM(COALESCE(rc."costCents", rc."estimatedCostCents")), 0) AS total
      FROM "rank_checks" rc
      JOIN "keywords" k ON k.id = rc."keywordId"
      WHERE k."projectId" = ${projectId}
        AND rc."checkedAt" >= ${range.start}
        AND rc."checkedAt" <= ${range.end}
    `,
      prisma.$queryRaw<DeferredGroupRow[]>`
      SELECT
        rc."deferredReason" AS reason,
        COUNT(*)::int AS count,
        COUNT(DISTINCT rc."keywordId")::int AS "keywordCount",
        MIN(rc."checkedAt") AS "firstAt",
        MAX(rc."checkedAt") AS "lastAt"
      FROM "rank_checks" rc
      JOIN "keywords" k ON k.id = rc."keywordId"
      WHERE k."projectId" = ${projectId}
        AND rc."checkedAt" >= ${range.start}
        AND rc."checkedAt" <= ${range.end}
        AND rc.status = 'deferred'
        AND rc."deferredReason" IN (
          'budget_exhausted',
          'migration_hold',
          'no_provider',
          'rate_limited'
        )
      GROUP BY rc."deferredReason"
      ORDER BY COUNT(*) DESC, rc."deferredReason" ASC
    `,
      prisma.rankCheck.groupBy({
        _count: { _all: true },
        by: ["provider", "viaFallback"],
        where: { ...scope, status: "completed" },
      }),
      prisma.$queryRaw<Array<{ attempts: unknown; provider: string; status: string }>>`
      SELECT rc.attempts, rc.provider, rc.status
      FROM "rank_checks" rc
      JOIN "keywords" k ON k.id = rc."keywordId"
      WHERE k."projectId" = ${projectId}
        AND rc."checkedAt" >= ${range.start}
        AND rc."checkedAt" <= ${range.end}
        AND (
          rc."viaFallback" = true
          OR rc.status IN ('failed', 'deferred')
        )
    `,
      providerChain,
    ]);

  const completed = countFor(statusGroups, "completed");
  const failed = countFor(statusGroups, "failed");
  const running = countFor(statusGroups, "running");

  return {
    counts: {
      completed,
      deferred: countFor(statusGroups, "deferred"),
      failed,
      running,
      runs: completed + failed + running,
      viaFallback,
    },
    deferredGroups: deferredGroups(deferredRows),
    providerHealth: buildProviderHealth(completionGroups, attemptRows, chain),
    spendCents: Number(spendRows[0]?.total ?? 0),
  };
}
