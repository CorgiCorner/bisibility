import "server-only";

import type { CostRateInfo } from "@/lib/cost-estimate/project-estimate";
import { prisma } from "@/lib/db/prisma";
import { monthlyBudgetExhausted } from "@/lib/rank-check/budget-contract";
import { requireReadableProject } from "./_auth";
import {
  getRequestMonthlySpendCents,
  getRequestPrimarySerpProvider,
} from "./workspace-request-data";

export type CheckHealth = Awaited<ReturnType<typeof getCheckHealth>>;

const DAY_MS = 24 * 60 * 60 * 1000;

function iso(date: Date) {
  return date.toISOString();
}

type CheckHealthStatsRow = {
  currentFailedCount: number;
  latestCurrentFailedCheckId: string | null;
  failedCount: number;
  latestCheckedAt: Date | null;
  latestError: string | null;
  latestErrorCode: string | null;
  latestKeyword: string | null;
  latestProvider: string | null;
  runningCount: number;
};

export async function loadCheckHealthStats(projectId: string, since: Date) {
  const [row] = await prisma.$queryRaw<CheckHealthStatsRow[]>`
    WITH scoped_keywords AS (
      SELECT id, text, "archivedAt" FROM "keywords" WHERE "projectId" = ${projectId}
    ), scoped_checks AS (
      SELECT rc."checkedAt", rc.error, rc."errorCode", rc.provider, rc.status, k.text AS keyword
      FROM "rank_checks" rc
      JOIN scoped_keywords k ON k.id = rc."keywordId"
    ), current_checks AS (
      SELECT latest.* FROM scoped_keywords k
      CROSS JOIN LATERAL (
        SELECT rc.id, rc."publicId", rc.status, rc."checkedAt"
        FROM "rank_checks" rc WHERE rc."keywordId" = k.id
        ORDER BY rc."checkedAt" DESC, rc.id DESC LIMIT 1
      ) latest
      WHERE k."archivedAt" IS NULL
    )
    SELECT
      (SELECT COUNT(*)::int FROM current_checks WHERE status = 'failed') AS "currentFailedCount",
      (SELECT "publicId" FROM current_checks WHERE status = 'failed'
        ORDER BY "checkedAt" DESC, id DESC LIMIT 1) AS "latestCurrentFailedCheckId",
      (SELECT COUNT(*)::int FROM scoped_checks WHERE status = 'failed' AND "checkedAt" >= ${since}) AS "failedCount",
      latest."checkedAt" AS "latestCheckedAt",
      latest.error AS "latestError",
      latest."errorCode" AS "latestErrorCode",
      latest.keyword AS "latestKeyword",
      latest.provider AS "latestProvider",
      (SELECT COUNT(*)::int FROM scoped_checks WHERE status = 'running') AS "runningCount"
    FROM (VALUES (1)) AS seed(value)
    LEFT JOIN LATERAL (
      SELECT "checkedAt", error, "errorCode", keyword, provider
      FROM scoped_checks
      WHERE status = 'failed' AND "checkedAt" >= ${since}
      ORDER BY "checkedAt" DESC
      LIMIT 1
    ) latest ON true
  `;
  return (
    row ?? {
      currentFailedCount: 0,
      latestCurrentFailedCheckId: null,
      failedCount: 0,
      latestCheckedAt: null,
      latestError: null,
      latestErrorCode: null,
      latestKeyword: null,
      latestProvider: null,
      runningCount: 0,
    }
  );
}

export async function getCheckHealth(projectId: string, options: { now?: Date } = {}) {
  const now = options.now ?? new Date();
  const since = new Date(now.getTime() - DAY_MS);
  const { project } = await requireReadableProject(projectId);
  const capCents = project.budgetCapCents;
  const [spentCents, stats, provider] = await Promise.all([
    getRequestMonthlySpendCents(project.id, now),
    loadCheckHealthStats(project.id, since),
    getRequestPrimarySerpProvider(project.id),
  ]);
  const configuredCost =
    provider?.costPerCheckCents == null ? null : Number(provider.costPerCheckCents);
  const providerRate: CostRateInfo = {
    overrideCents:
      configuredCost != null && Number.isFinite(configuredCost) && configuredCost >= 0
        ? configuredCost
        : null,
    providerId: provider?.provider ?? null,
  };

  return {
    budget: {
      capCents,
      exhausted: monthlyBudgetExhausted(capCents, spentCents),
      spentCents,
    },
    currentFailures: {
      count: stats.currentFailedCount ?? 0,
      latestCheckId: stats.latestCurrentFailedCheckId ?? null,
    },
    failed24h: {
      count: stats.failedCount,
      latest: stats.latestCheckedAt
        ? {
            checkedAt: iso(stats.latestCheckedAt),
            error: stats.latestError,
            errorCode: stats.latestErrorCode,
            keyword: stats.latestKeyword ?? "Unknown keyword",
            provider: stats.latestProvider ?? "unknown",
          }
        : null,
    },
    providerConnected: Boolean(provider),
    providerRate,
    runningCount: stats.runningCount,
  };
}
