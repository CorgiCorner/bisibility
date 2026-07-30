import "server-only";

import { whereExecutedChecks } from "@/lib/checks/status";
import { prisma } from "@/lib/db/prisma";
import { monthStartUtc } from "@/lib/rank-check/budget";
import { fetchProjectKeywordVolumes } from "./keyword-metrics-query";
import {
  normalizeOverviewFilters,
  type OverviewFilters,
  overviewCheckStart,
  overviewKeywordWhere,
} from "./overview-filters";

const OVERVIEW_KEYWORD_MAX = 2000;
const OVERVIEW_CHECK_MAX = 30;

function nextMonthStartUtc(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

export async function loadOverviewMetricData(
  projectId: string,
  input: Partial<OverviewFilters> = {},
  now = new Date(),
) {
  const filters = normalizeOverviewFilters(input);
  const where = overviewKeywordWhere(projectId, filters);
  const checkedAt = { gte: overviewCheckStart(now, filters.range) };
  const [
    projectDefaults,
    keywords,
    filteredKeywordCount,
    addedThisMonth,
    keywordVolumes,
    latestCheck,
  ] = await Promise.all([
    prisma.projectDefaults.findUnique({
      select: {
        cronExpression: true,
        frequency: true,
        jitterMinutes: true,
        nextCheckAt: true,
        timezone: true,
      },
      where: { projectId },
    }),
    prisma.keyword.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        _count: { select: { rankChecks: { where: whereExecutedChecks() } } },
        createdAt: true,
        device: true,
        id: true,
        publicId: true,
        rankChecks: {
          orderBy: { checkedAt: "desc" },
          select: {
            checkedAt: true,
            position: true,
            previousPosition: true,
            rankingUrl: true,
            status: true,
          },
          take: OVERVIEW_CHECK_MAX,
          where: { checkedAt, ...whereExecutedChecks() },
        },
        schedule: {
          select: {
            cronExpression: true,
            frequency: true,
            jitterMinutes: true,
            nextCheckAt: true,
            timezone: true,
          },
        },
        text: true,
      },
      take: OVERVIEW_KEYWORD_MAX,
      where,
    }),
    prisma.keyword.count({ where }),
    prisma.keyword.count({
      where: {
        ...where,
        createdAt: { gte: monthStartUtc(now), lt: nextMonthStartUtc(now) },
      },
    }),
    fetchProjectKeywordVolumes(projectId, OVERVIEW_KEYWORD_MAX, {
      device: filters.device === "all" ? null : filters.device,
      tag: filters.tag,
    }),
    prisma.rankCheck.findFirst({
      orderBy: { checkedAt: "desc" },
      select: { checkedAt: true, provider: true },
      where: { keyword: { projectId }, status: "completed" },
    }),
  ]);

  return {
    addedThisMonth,
    filteredKeywordCount,
    filters,
    keywordVolumes,
    keywords,
    latestCheck,
    projectDefaults,
    where,
  };
}
