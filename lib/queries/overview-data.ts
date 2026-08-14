import "server-only";

import { whereExecutedChecks } from "@/lib/checks/status";
import { prisma } from "@/lib/db/prisma";
import { monthStartUtc } from "@/lib/rank-check/budget";
import { supportsResearchMarket } from "@/lib/serp/market-capability";
import { fetchProjectKeywordVolumes } from "./keyword-metrics-query";
import {
  normalizeOverviewFilters,
  type OverviewFilters,
  overviewCheckStart,
  overviewKeywordWhere,
} from "./overview-filters";
import { fetchOverviewMarketChecks } from "./overview-market-query";

const OVERVIEW_KEYWORD_MAX = 2000;
const OVERVIEW_CHECK_MAX = 30;

function nextMonthStartUtc(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

export async function loadOverviewMetricData(
  projectId: string,
  input: Partial<OverviewFilters> = {},
  now = new Date(),
  options: { includeMarkets?: boolean } = {},
) {
  const filters = normalizeOverviewFilters(input);
  const where = overviewKeywordWhere(projectId, filters);
  const checkedAt = { gte: overviewCheckStart(now, filters.range) };
  const [
    projectDefaults,
    keywords,
    marketKeywords,
    projectMarkets,
    filteredKeywordCount,
    addedThisMonth,
    keywordVolumes,
    marketChecks,
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
        locationRef: { select: { displayName: true, languageLabel: true } },
        publicId: true,
        rankChecks: {
          orderBy: { checkedAt: "desc" },
          select: {
            checkedAt: true,
            normalizationVersion: true,
            position: true,
            previousPosition: true,
            requestedDepth: true,
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
    options.includeMarkets
      ? prisma.keyword.findMany({
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: {
            id: true,
            locationId: true,
            locationRef: { select: { displayName: true, languageLabel: true } },
            schedule: { select: { frequency: true } },
          },
          take: OVERVIEW_KEYWORD_MAX,
          where,
        })
      : Promise.resolve([]),
    options.includeMarkets
      ? prisma.projectMarket.findMany({
          orderBy: [{ location: { displayName: "asc" } }, { location: { languageLabel: "asc" } }],
          select: {
            locationId: true,
            location: {
              select: {
                countryCode: true,
                displayName: true,
                languageCode: true,
                languageLabel: true,
              },
            },
          },
          where: { projectId, status: "active" },
        })
      : Promise.resolve([]),
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
    options.includeMarkets
      ? fetchOverviewMarketChecks(projectId, OVERVIEW_KEYWORD_MAX, now, filters.range, {
          device: filters.device === "all" ? null : filters.device,
          marketIds: filters.marketIds,
          tag: filters.tag,
        })
      : Promise.resolve(new Map()),
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
    marketKeywords: marketKeywords.map((keyword) => ({
      ...keyword,
      rankChecks: marketChecks.get(keyword.id) ?? [],
    })),
    projectMarkets: projectMarkets.map((market) => ({
      ...market,
      researchAvailable: supportsResearchMarket(
        market.location.countryCode,
        market.location.languageCode,
      ),
    })),
    projectDefaults,
    where,
  };
}
