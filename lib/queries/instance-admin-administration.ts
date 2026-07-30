import "server-only";

import { getInstanceAdminSession } from "@/lib/auth/instance-admin";
import { prisma } from "@/lib/db/prisma";
import {
  aggregateProviderReferenceUsage,
  type ReferenceUsageGroup,
} from "@/lib/rank-check/reference-usage";
import { notFound } from "next/navigation";

const DAY_MS = 24 * 60 * 60 * 1_000;
const GROWTH_DAYS = 30;
const WAU_DAYS = 7;

export type GrowthPoint = { count: number; date: string };
export type GrowthMetric = {
  delta: number;
  deltaPercent: number | null;
  points: readonly GrowthPoint[];
  priorTotal: number;
  total: number;
};
export type TopProjectConsumption = {
  billableUnits: number;
  checks: number;
  projectId: string;
  provider: string;
  providerLabel: string;
  rateBasis: string;
  referenceCostCents: number;
  referenceCostKnown: boolean;
  sharePercent: number;
};
export type InstanceAdminAdministration = {
  activeAccountsApprox: number;
  generatedAt: string;
  growth: {
    keywords: GrowthMetric;
    projects: GrowthMetric;
    rankChecks: GrowthMetric;
    users: GrowthMetric;
  };
  monthStart: string;
  topConsumption: readonly TopProjectConsumption[];
};

type GrowthRow = { count: bigint | number; day: string };
type CountRow = { count: bigint | number };
type ConsumptionGroupRow = {
  billingUnits: number | null;
  checks: bigint | number;
  projectId: string;
  provider: string;
  requestedDepth: number | null;
};

function startOfUtcDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function addUtcDays(value: Date, days: number) {
  return new Date(value.getTime() + days * DAY_MS);
}

function utcDateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function numeric(value: bigint | number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function growthMetric(
  rows: readonly GrowthRow[],
  currentStart: Date,
  priorStart: Date,
): GrowthMetric {
  const counts = new Map(rows.map((row) => [row.day, numeric(row.count)]));
  const points = Array.from({ length: GROWTH_DAYS }, (_, index) => {
    const date = utcDateKey(addUtcDays(currentStart, index));
    return { count: counts.get(date) ?? 0, date };
  });
  let priorTotal = 0;
  for (let index = 0; index < GROWTH_DAYS; index += 1) {
    priorTotal += counts.get(utcDateKey(addUtcDays(priorStart, index))) ?? 0;
  }
  const total = points.reduce((sum, point) => sum + point.count, 0);
  const delta = total - priorTotal;

  return {
    delta,
    deltaPercent: priorTotal === 0 ? (total === 0 ? 0 : null) : (delta / priorTotal) * 100,
    points,
    priorTotal,
    total,
  };
}

export async function getInstanceAdminAdministration(
  now = new Date(),
): Promise<InstanceAdminAdministration> {
  const session = await getInstanceAdminSession();
  if (!session) {
    notFound();
  }

  const currentStart = addUtcDays(startOfUtcDay(now), -(GROWTH_DAYS - 1));
  const currentEnd = addUtcDays(startOfUtcDay(now), 1);
  const priorStart = addUtcDays(currentStart, -GROWTH_DAYS);
  const wauStart = addUtcDays(currentEnd, -WAU_DAYS);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const nextMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  const [users, projects, keywords, rankChecks, activeAccounts, consumption] = await Promise.all([
    prisma.$queryRaw<GrowthRow[]>`
      SELECT to_char(date_trunc('day', ("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
             COUNT(*)::bigint AS count
      FROM "users"
      WHERE "createdAt" >= ${priorStart} AND "createdAt" < ${currentEnd}
      GROUP BY day
      ORDER BY day ASC
    `,
    prisma.$queryRaw<GrowthRow[]>`
      SELECT to_char(date_trunc('day', ("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
             COUNT(*)::bigint AS count
      FROM "projects"
      WHERE "createdAt" >= ${priorStart} AND "createdAt" < ${currentEnd}
      GROUP BY day
      ORDER BY day ASC
    `,
    prisma.$queryRaw<GrowthRow[]>`
      SELECT to_char(date_trunc('day', ("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
             COUNT(*)::bigint AS count
      FROM "keywords"
      WHERE "createdAt" >= ${priorStart} AND "createdAt" < ${currentEnd}
      GROUP BY day
      ORDER BY day ASC
    `,
    prisma.$queryRaw<GrowthRow[]>`
      SELECT to_char(date_trunc('day', ("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
             COUNT(*)::bigint AS count
      FROM "rank_checks"
      WHERE "createdAt" >= ${priorStart} AND "createdAt" < ${currentEnd}
      GROUP BY day
      ORDER BY day ASC
    `,
    prisma.$queryRaw<CountRow[]>`
      SELECT COUNT(DISTINCT "userId")::bigint AS count
      FROM "sessions"
      WHERE "updatedAt" >= ${wauStart} AND "updatedAt" < ${currentEnd}
    `,
    prisma.$queryRaw<ConsumptionGroupRow[]>`
      SELECT k."projectId" AS "projectId",
             rc.provider,
             rc."requestedDepth",
             rc."billingUnits",
             COUNT(*)::bigint AS checks
      FROM "rank_checks" rc
      INNER JOIN "keywords" k ON k.id = rc."keywordId"
      WHERE rc."checkedAt" >= ${monthStart}
        AND rc."checkedAt" < ${nextMonthStart}
        AND rc.status = 'completed'
      GROUP BY k."projectId", rc.provider, rc."requestedDepth", rc."billingUnits"
    `,
  ]);

  const consumptionGroups = new Map<string, { groups: ReferenceUsageGroup[]; projectId: string }>();
  for (const row of consumption) {
    const key = JSON.stringify([row.projectId, row.provider]);
    const entry = consumptionGroups.get(key) ?? { groups: [], projectId: row.projectId };
    entry.groups.push({
      billingUnits: row.billingUnits,
      checks: numeric(row.checks),
      provider: row.provider,
      requestedDepth: row.requestedDepth,
    });
    consumptionGroups.set(key, entry);
  }
  const usageRows = [...consumptionGroups.values()].flatMap((entry) =>
    aggregateProviderReferenceUsage(entry.groups).map((usage) => ({ ...entry, ...usage })),
  );
  const instanceReferenceCostCents = usageRows.reduce(
    (sum, row) => sum + (row.referenceCostKnown ? row.referenceCostCents : 0),
    0,
  );
  const topConsumption = usageRows
    .map(({ groups: _groups, ...row }) => ({
      ...row,
      sharePercent:
        row.referenceCostKnown && instanceReferenceCostCents > 0
          ? (row.referenceCostCents / instanceReferenceCostCents) * 100
          : 0,
    }))
    .sort(
      (left, right) =>
        right.referenceCostCents - left.referenceCostCents ||
        left.projectId.localeCompare(right.projectId) ||
        left.provider.localeCompare(right.provider),
    )
    .slice(0, 10);

  return {
    activeAccountsApprox: numeric(activeAccounts[0]?.count),
    generatedAt: now.toISOString(),
    growth: {
      keywords: growthMetric(keywords, currentStart, priorStart),
      projects: growthMetric(projects, currentStart, priorStart),
      rankChecks: growthMetric(rankChecks, currentStart, priorStart),
      users: growthMetric(users, currentStart, priorStart),
    },
    monthStart: monthStart.toISOString(),
    topConsumption,
  };
}
