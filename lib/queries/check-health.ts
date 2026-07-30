import "server-only";

import type { CostRateInfo } from "@/lib/cost-estimate/project-estimate";
import { prisma } from "@/lib/db/prisma";
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
  failedCount: number;
  latestCheckedAt: Date | null;
  latestError: string | null;
  latestKeyword: string | null;
  latestProvider: string | null;
  runningCount: number;
};

export async function loadCheckHealthStats(projectId: string, since: Date) {
  const [row] = await prisma.$queryRaw<CheckHealthStatsRow[]>`
    WITH scoped_checks AS (
      SELECT rc."checkedAt", rc.error, rc.provider, rc.status, k.text AS keyword
      FROM "rank_checks" rc
      JOIN "keywords" k ON k.id = rc."keywordId"
      WHERE k."projectId" = ${projectId}
    )
    SELECT
      (SELECT COUNT(*)::int FROM scoped_checks WHERE status = 'failed' AND "checkedAt" >= ${since}) AS "failedCount",
      latest."checkedAt" AS "latestCheckedAt",
      latest.error AS "latestError",
      latest.keyword AS "latestKeyword",
      latest.provider AS "latestProvider",
      (SELECT COUNT(*)::int FROM scoped_checks WHERE status = 'running') AS "runningCount"
    FROM (VALUES (1)) AS seed(value)
    LEFT JOIN LATERAL (
      SELECT "checkedAt", error, keyword, provider
      FROM scoped_checks
      WHERE status = 'failed' AND "checkedAt" >= ${since}
      ORDER BY "checkedAt" DESC
      LIMIT 1
    ) latest ON true
  `;
  return (
    row ?? {
      failedCount: 0,
      latestCheckedAt: null,
      latestError: null,
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
      exhausted: spentCents >= capCents,
      spentCents,
    },
    failed24h: {
      count: stats.failedCount,
      latest: stats.latestCheckedAt
        ? {
            checkedAt: iso(stats.latestCheckedAt),
            error: stats.latestError,
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
