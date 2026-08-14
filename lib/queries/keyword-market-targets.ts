import "server-only";

import { whereExecutedChecks } from "@/lib/checks/status";
import { prisma } from "@/lib/db/prisma";
import { parsePublicId } from "@/lib/db/public-id";
import type { Prisma } from "@/lib/generated/prisma/client";
import { fetchKeywordMetrics } from "@/lib/queries/keyword-metrics-query";
import { type KeywordRow, mapKeyword } from "@/lib/queries/keyword-row";
import { getRequestProjectDefaults } from "@/lib/queries/workspace-request-data";
import { ACTIVE_QUEUED_TASK_STATES } from "@/lib/rank-check/queued-state";
import { trackedProjectDomain } from "@/lib/schemas/project";
import { requireReadableProject } from "./_auth";

const DETAIL_CHECK_HISTORY = 90;

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
  queuedRankCheckTasks: {
    select: { state: true },
    take: 1,
    where: { state: { in: ACTIVE_QUEUED_TASK_STATES } },
  },
  rankChecks: {
    orderBy: { checkedAt: "desc" as const },
    select: {
      checkedAt: true,
      degradedToCountry: true,
      id: true,
      normalizationVersion: true,
      position: true,
      previousPosition: true,
      rankingUrl: true,
      requestedDepth: true,
      status: true,
    },
    take: DETAIL_CHECK_HISTORY,
    where: whereExecutedChecks(),
  },
  schedule: true,
  tags: { include: { tag: true } },
} satisfies Prisma.KeywordInclude;

export async function getKeywordMarketTargets(
  projectRef: string,
  keywordId: string,
): Promise<KeywordRow[]> {
  if (parsePublicId(keywordId)?.prefix !== "kw") return [];
  const { project } = await requireReadableProject(projectRef);
  const anchor = await prisma.keyword.findFirst({
    select: { text: true },
    where: { projectId: project.id, publicId: keywordId },
  });
  if (!anchor) return [];

  const [defaults, records] = await Promise.all([
    getRequestProjectDefaults(project.id),
    prisma.keyword.findMany({
      include,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      where: { projectId: project.id, text: anchor.text },
    }),
  ]);
  const metrics = await Promise.all(
    records.map((record) => fetchKeywordMetrics(record.id, DETAIL_CHECK_HISTORY)),
  );
  const context = { defaults, domain: trackedProjectDomain(project.domain) ?? "" };
  return records.map((record, index) => {
    const metric = metrics[index];
    if (!metric) throw new Error("Keyword market metrics are missing.");
    return mapKeyword(record, context, metric);
  });
}
