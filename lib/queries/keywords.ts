import "server-only";

import {
  comparableCompletedWindow,
  whereComparableTo,
  whereExecutedChecks,
} from "@/lib/checks/status";
import { prisma } from "@/lib/db/prisma";
import { parsePublicId } from "@/lib/db/public-id";
import type { Prisma } from "@/lib/generated/prisma/client";
import { presenceUrl } from "@/lib/presence/url";
import type { KeywordDefaultMarketRow } from "@/lib/serp/default-market";
import { projectDefaultSerpMarket } from "@/lib/serp/default-market";
import { requireReadableProject } from "./_auth";

export type { KeywordLocation } from "./keyword-location";

import type { Metrics } from "./keyword-metrics";
import { fetchKeywordMetrics, fetchProjectKeywordMetrics } from "./keyword-metrics-query";
import { type KeywordRow, mapKeyword } from "./keyword-row";
import { fetchProjectKeywordTraffic, getKeywordTraffic } from "./keyword-traffic";
import { getRequestProjectDefaults } from "./workspace-request-data";

export type {
  KeywordRow,
  KeywordSchedule,
  LastCheckStatus,
  PositionPoint,
  RankingUrlEvent,
  UrlPresenceView,
} from "./keyword-row";

export const KEYWORD_LIST_MAX = 1000;
const LIST_CHECK_HISTORY = 12;
// Counts newest attempts, including failed checks.
// Bounds position chart, ranking-URL history, and CSV export.
const DETAIL_CHECK_HISTORY = 90;

const EMPTY_METRICS: Metrics = {
  cpc: null,
  difficulty: null,
  serpFeatures: [],
  volume: null,
};
const rankCheckSelect = {
  checkedAt: true,
  id: true,
  normalizationVersion: true,
  position: true,
  previousPosition: true,
  requestedDepth: true,
  rankingUrl: true,
  status: true,
} as const;
const scheduleSelect = {
  cronExpression: true,
  frequency: true,
  jitterMinutes: true,
  lastCheckedAt: true,
  nextCheckAt: true,
  serpDepth: true,
  timezone: true,
} as const;
const locationRefSelect = {
  canonicalKey: true,
  cityName: true,
  countryCode: true,
  displayName: true,
  gl: true,
  hl: true,
  id: true,
  kind: true,
} as const;
const presenceSelect = {
  canonicalOk: true,
  checkedAt: true,
  coverageState: true,
  lastCrawlAt: true,
  url: true,
  verdict: true,
} as const;

async function loadKeywords(projectId: string) {
  return prisma.keyword.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      createdAt: true,
      device: true,
      id: true,
      intent: true,
      location: true,
      locationRef: { select: locationRefSelect },
      publicId: true,
      rankChecks: {
        orderBy: { checkedAt: "desc" },
        select: rankCheckSelect,
        take: LIST_CHECK_HISTORY,
        where: whereExecutedChecks(),
      },
      schedule: { select: scheduleSelect },
      tags: { select: { tag: { select: { name: true } } } },
      targetUrl: true,
      text: true,
      topic: true,
    },
    take: KEYWORD_LIST_MAX,
    where: { projectId },
  });
}

async function loadKeywordDetail(projectId: string, keywordId: string) {
  if (parsePublicId(keywordId)?.prefix !== "kw") {
    return null;
  }

  const include = {
    alertTargets: {
      select: {
        rule: {
          select: {
            conditionType: true,
            enabled: true,
            thresholdPosition: true,
            topN: true,
            updatedAt: true,
          },
        },
      },
    },
    locationRef: true,
    project: {
      include: {
        defaults: true,
        providerConnections: {
          select: { id: true },
          take: 1,
          where: { enabled: true, kind: "serp", status: "connected" },
        },
      },
    },
    rankChecks: {
      orderBy: { checkedAt: "desc" as const },
      select: rankCheckSelect,
      take: DETAIL_CHECK_HISTORY,
      where: whereExecutedChecks(),
    },
    schedule: true,
    tags: { include: { tag: true } },
  } satisfies Prisma.KeywordInclude;
  const keyword = await prisma.keyword.findFirst({
    include,
    where: { projectId, publicId: keywordId },
  });
  return keyword;
}

export async function getKeywordRows(projectId: string): Promise<KeywordRow[]> {
  const { project } = await requireReadableProject(projectId);
  const [keywords, defaults, metricsMap, trafficMap] = await Promise.all([
    loadKeywords(project.id),
    getRequestProjectDefaults(project.id),
    fetchProjectKeywordMetrics(project.id, KEYWORD_LIST_MAX),
    fetchProjectKeywordTraffic(project.id),
  ]);
  const meta = { defaults, domain: project.domain };
  return keywords.map((keyword) =>
    mapKeyword(
      keyword,
      meta,
      metricsMap.get(keyword.id) ?? EMPTY_METRICS,
      trafficMap.get(keyword.id),
    ),
  );
}

export async function getKeywordDefaultMarket(projectId: string) {
  const { project } = await requireReadableProject(projectId);
  const [defaults, keywords] = await Promise.all([
    getRequestProjectDefaults(project.id),
    prisma.$queryRaw<KeywordDefaultMarketRow[]>`
      SELECT
        k.device::text AS device,
        k.location,
        jsonb_build_object(
          'canonicalKey', l."canonicalKey",
          'cityName', l."cityName",
          'countryCode', l."countryCode",
          'displayName', l."displayName",
          'kind', l.kind
        ) AS "locationRef"
      FROM "keywords" k
      JOIN "locations" l ON l.id = k."locationId"
      WHERE k."projectId" = ${project.id}
    `,
  ]);
  return projectDefaultSerpMarket(defaults, keywords);
}

export async function getKeywordTagSuggestions(projectId: string): Promise<string[]> {
  const { project } = await requireReadableProject(projectId);
  const tags = await prisma.tag.findMany({
    include: { _count: { select: { keywords: true } } },
    orderBy: { createdAt: "desc" },
    where: { projectId: project.id },
  });
  tags.sort(
    (a, b) =>
      b._count.keywords - a._count.keywords || b.createdAt.getTime() - a.createdAt.getTime(),
  );
  return tags.slice(0, 8).map((tag) => tag.name);
}

export async function getKeywordCount(projectId: string) {
  const { project } = await requireReadableProject(projectId);
  return prisma.keyword.count({ where: { projectId: project.id } });
}

export async function getKeywordDetail(projectId: string, keywordId: string) {
  const { project } = await requireReadableProject(projectId);
  const record = await loadKeywordDetail(project.id, keywordId);
  if (!record) return null;

  const url = presenceUrl(record.targetUrl);
  const currentComparableCheck = comparableCompletedWindow(record.rankChecks).checks[0] ?? null;
  const comparablePredicate = currentComparableCheck
    ? whereComparableTo(currentComparableCheck)
    : null;
  const [metrics, aggregate, traffic, urlPresence] = await Promise.all([
    fetchKeywordMetrics(record.id, DETAIL_CHECK_HISTORY),
    comparablePredicate
      ? prisma.rankCheck.aggregate({
          _min: { position: true },
          where: {
            keywordId: record.id,
            position: { not: null },
            ...comparablePredicate,
          },
        })
      : Promise.resolve({ _min: { position: null } }),
    getKeywordTraffic(project.id, record.id, {
      rankingUrl: record.rankChecks.find((check) => check.rankingUrl)?.rankingUrl ?? null,
      targetUrl: record.targetUrl,
    }),
    url
      ? prisma.urlPresence.findUnique({
          select: presenceSelect,
          where: { projectId_url: { projectId: project.id, url } },
        })
      : Promise.resolve(null),
  ]);
  const row = mapKeyword(
    { ...record, urlPresence },
    {
      defaults: record.project.defaults,
      domain: record.project.domain,
    },
    metrics,
    traffic.query ?? undefined,
  );
  return {
    ...row,
    bestPosition: aggregate._min.position ?? row.bestPosition,
    providerConnected: record.project.providerConnections.length > 0,
    traffic,
  };
}
