import "server-only";

import type { AlertRuleForm } from "@/lib/alerts/schema";
import { prisma } from "@/lib/db/prisma";
import { serpDepthDecreaseWarning } from "@/lib/schemas/serp-depth";
import { resolveSerpDepth, type SerpDepth } from "@/lib/serp/markets";
import {
  alertDepthConflict,
  alertDepthConflictWarning,
  alertPositionThreshold,
  minimumTargetedDepth,
} from "./depth-conflict";

function keywordTargetWhere(data: AlertRuleForm, projectId: string) {
  if (data.targetType === "keyword") {
    return {
      projectId,
      publicId: { in: data.targetIds },
    };
  }
  if (data.targetType === "tag") {
    return {
      projectId,
      tags: { some: { tag: { publicId: { in: data.targetIds } } } },
    };
  }
  return { projectId };
}

export async function getAlertRuleDepthWarning(data: AlertRuleForm, projectId: string) {
  if (alertPositionThreshold(data) === null) return null;

  const keywords = await prisma.keyword.findMany({
    select: {
      id: true,
      project: { select: { defaults: { select: { serpDepth: true } } } },
      schedule: { select: { serpDepth: true } },
    },
    where: keywordTargetWhere(data, projectId),
  });
  const trackedDepth = minimumTargetedDepth(
    { targetIds: [], targetType: "all" },
    keywords.map((keyword) => ({
      id: keyword.id,
      projectDepth: keyword.project?.defaults?.serpDepth,
      scheduleDepth: keyword.schedule?.serpDepth,
    })),
  );
  return alertDepthConflictWarning(alertDepthConflict(data, trackedDepth));
}

type StoredRule = {
  conditionType: string;
  name: string;
  targetType: string;
  thresholdPosition: number | null;
  topN: number | null;
  targets: { keywordId: string | null; tagId: string | null }[];
};

function affectedRuleNames(
  rules: readonly StoredRule[],
  depth: SerpDepth,
  keywords: readonly { id: string; tagIds: readonly string[] }[],
) {
  const keywordIds = new Set(keywords.map((keyword) => keyword.id));
  const tagIds = new Set(keywords.flatMap((keyword) => keyword.tagIds));
  return rules.flatMap((rule) => {
    const threshold = alertPositionThreshold(rule);
    if (threshold === null || threshold <= depth) return [];
    const targetsKeyword = rule.targets.some(
      (target) => target.keywordId !== null && keywordIds.has(target.keywordId),
    );
    const targetsTag = rule.targets.some(
      (target) => target.tagId !== null && tagIds.has(target.tagId),
    );
    return rule.targetType === "all" || targetsKeyword || targetsTag ? [rule.name] : [];
  });
}

function loweringWarning(depth: SerpDepth, names: readonly string[]) {
  if (names.length === 0) return null;
  return `${serpDepthDecreaseWarning(depth)}. Affected alerts: ${names.join(", ")}.`;
}

const storedRuleSelect = {
  conditionType: true,
  name: true,
  targetType: true,
  targets: { select: { keywordId: true, tagId: true } },
  thresholdPosition: true,
  topN: true,
} as const;

export async function getProjectDepthDecreaseWarning(projectId: string, depth: SerpDepth) {
  const [project, rules] = await Promise.all([
    prisma.project.findUnique({
      select: {
        defaults: { select: { serpDepth: true } },
        keywords: {
          select: {
            id: true,
            schedule: { select: { serpDepth: true } },
            tags: { select: { tagId: true } },
          },
        },
      },
      where: { id: projectId },
    }),
    prisma.alertRule.findMany({ select: storedRuleSelect, where: { enabled: true, projectId } }),
  ]);
  const currentDepth = resolveSerpDepth(project?.defaults?.serpDepth);
  if (depth >= currentDepth) return null;
  const inheriting = (project?.keywords ?? [])
    .filter((keyword) => keyword.schedule?.serpDepth == null)
    .map((keyword) => ({ id: keyword.id, tagIds: keyword.tags.map((tag) => tag.tagId) }));
  return loweringWarning(depth, affectedRuleNames(rules, depth, inheriting));
}

export async function getKeywordDepthDecreaseWarning(
  keywordId: string,
  depth: SerpDepth | null | undefined,
) {
  const keyword = await prisma.keyword.findUnique({
    select: {
      id: true,
      project: { select: { defaults: { select: { serpDepth: true } } } },
      projectId: true,
      schedule: { select: { serpDepth: true } },
      tags: { select: { tagId: true } },
    },
    where: { id: keywordId },
  });
  if (!keyword) return null;
  const projectDepth = resolveSerpDepth(keyword.project.defaults?.serpDepth);
  const currentDepth = resolveSerpDepth(keyword.schedule?.serpDepth ?? projectDepth);
  const nextDepth = resolveSerpDepth(depth ?? projectDepth);
  if (nextDepth >= currentDepth) return null;
  const rules = await prisma.alertRule.findMany({
    select: storedRuleSelect,
    where: { enabled: true, projectId: keyword.projectId },
  });
  return loweringWarning(
    nextDepth,
    affectedRuleNames(rules, nextDepth, [
      { id: keyword.id, tagIds: keyword.tags.map((tag) => tag.tagId) },
    ]),
  );
}
