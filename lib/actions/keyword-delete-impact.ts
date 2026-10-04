"use server";

import { prisma } from "@/lib/db/prisma";
import type { KeywordDeleteImpact } from "@/lib/keywords/delete-impact";
import { ACTIVE_RUN_STATUSES } from "@/lib/rank-check/runs/contract";
import { bulkKeywordIdsSchema } from "@/lib/schemas/keyword";
import { activeSnapshotExtensionWhere } from "@/lib/serp/snapshot-extension-active";
import { getActionActor, parseActionInput, requireProjectScope } from "./_shared";
import { keywordIdsWhere } from "./keyword-helpers";

/** Count the entire schedule, including members outside the current page or market. */
export async function previewKeywordDeletion(input: unknown): Promise<KeywordDeleteImpact> {
  const data = parseActionInput(bulkKeywordIdsSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "delete", data.projectId, { type: "keyword" });
  const keywords = await prisma.keyword.findMany({
    select: {
      text: true,
      rankChecks: { select: { id: true }, take: 1, where: activeSnapshotExtensionWhere() },
      rankCheckRunItems: {
        select: { id: true },
        take: 1,
        where: {
          rankCheckId: { not: null },
          status: "running",
          run: { status: { in: [...ACTIVE_RUN_STATUSES] } },
        },
      },
      checkSchedule: {
        select: { publicId: true, name: true, _count: { select: { keywords: true } } },
      },
    },
    where: keywordIdsWhere(project.id, data.keywordIds),
  });
  const schedules = new Map<string, KeywordDeleteImpact["schedules"][number]>();
  for (const keyword of keywords) {
    const schedule = keyword.checkSchedule;
    if (!schedule) continue;
    const impact = schedules.get(schedule.publicId) ?? {
      publicId: schedule.publicId,
      name: schedule.name,
      removedTargets: 0,
      remainingTargets: schedule._count.keywords,
    };
    impact.removedTargets += 1;
    impact.remainingTargets -= 1;
    schedules.set(schedule.publicId, impact);
  }
  return {
    keywordCount: new Set(keywords.map(({ text }) => text)).size,
    targetCount: keywords.length,
    runningTargetCount: keywords.filter(
      (keyword) => keyword.rankCheckRunItems.length > 0 || keyword.rankChecks?.length,
    ).length,
    schedules: [...schedules.values()].sort((a, b) => a.name.localeCompare(b.name)),
  };
}
