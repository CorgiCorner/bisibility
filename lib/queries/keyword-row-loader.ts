import "server-only";

import { whereExecutedChecks } from "@/lib/checks/status";
import { prisma } from "@/lib/db/prisma";
import { ACTIVE_QUEUED_TASK_STATES } from "@/lib/rank-check/queued-state";
import { trackedProjectDomain } from "@/lib/schemas/project";
import { fetchKeywordMetricsByIds } from "./keyword-metrics-query";
import { type KeywordRow, mapKeyword } from "./keyword-row";
import { fetchProjectKeywordTraffic } from "./keyword-traffic";
import { getRequestProjectDefaults } from "./workspace-request-data";

const EMPTY_METRICS = { cpc: null, difficulty: null, serpFeatures: [], volume: null };
const rankCheckSelect = {
  checkedAt: true,
  degradedToCountry: true,
  errorCode: true,
  id: true,
  normalizationVersion: true,
  position: true,
  previousPosition: true,
  provider: true,
  requestedDepth: true,
  rankingUrl: true,
  status: true,
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
  languageLabel: true,
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
const pendingTasks = {
  select: { state: true },
  take: 1,
  where: { state: { in: ACTIVE_QUEUED_TASK_STATES } },
} as const;

async function loadKeywordRowsChunk(
  project: { domain: string | null; id: string },
  keywordIds: string[],
): Promise<KeywordRow[]> {
  if (keywordIds.length === 0) return [];
  const [keywords, defaults, metricsMap, trafficMap] = await Promise.all([
    prisma.keyword.findMany({
      select: {
        createdAt: true,
        device: true,
        id: true,
        intent: true,
        location: true,
        locationRef: { select: locationRefSelect },
        publicId: true,
        queuedRankCheckTasks: pendingTasks,
        rankChecks: {
          orderBy: [{ checkedAt: "desc" }, { id: "desc" }],
          select: rankCheckSelect,
          take: 12,
          where: whereExecutedChecks(),
        },
        schedule: { select: scheduleSelect },
        tags: { select: { tag: { select: { name: true } } } },
        targetUrl: true,
        text: true,
        topic: true,
      },
      where: { id: { in: keywordIds }, projectId: project.id },
    }),
    getRequestProjectDefaults(project.id),
    fetchKeywordMetricsByIds(keywordIds),
    fetchProjectKeywordTraffic(project.id, keywordIds),
  ]);
  const byId = new Map(keywords.map((keyword) => [keyword.id, keyword]));
  const meta = { defaults, domain: trackedProjectDomain(project.domain) ?? "" };
  return keywordIds.flatMap((id) => {
    const keyword = byId.get(id);
    return keyword
      ? [mapKeyword(keyword, meta, metricsMap.get(id) ?? EMPTY_METRICS, trafficMap.get(id))]
      : [];
  });
}

export async function loadKeywordRowsByInternalIds(
  project: { domain: string | null; id: string },
  keywordIds: string[],
): Promise<KeywordRow[]> {
  const chunks: string[][] = [];
  for (let offset = 0; offset < keywordIds.length; offset += 250) {
    chunks.push(keywordIds.slice(offset, offset + 250));
  }
  const loaded: KeywordRow[] = [];
  for (const ids of chunks) loaded.push(...(await loadKeywordRowsChunk(project, ids)));
  return loaded;
}
