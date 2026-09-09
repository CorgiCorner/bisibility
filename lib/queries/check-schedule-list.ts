import "server-only";

import { unitCostCentsFor } from "@/lib/cost-estimate/project-estimate";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { loadSerpProviderChain } from "@/lib/rank-check/provider-chain-loader";
import { activeMarketLocationIds, runnableKeywordWhere } from "@/lib/rank-check/runnable";
import { ordinalDayOfMonth, persistedScheduleCalendar } from "@/lib/schedules/cadence-label";
import { resolveSerpDepth } from "@/lib/serp/constants";
import { getRequestProjectDefaults } from "./workspace-request-data";

function scheduleListSelect(activeLocationIds: Iterable<string>) {
  return {
    archivedAt: true,
    cronExpression: true,
    enabled: true,
    frequency: true,
    id: true,
    isDefault: true,
    jitterMinutes: true,
    _count: { select: { keywords: { where: runnableKeywordWhere(activeLocationIds) } } },
    name: true,
    providerPolicy: true,
    publicId: true,
    rankCheckRuns: {
      orderBy: { plannedFor: "asc" },
      select: { plannedFor: true },
      take: 1,
      where: { status: { in: ["blocked", "planned"] } },
    },
    serpDepth: true,
    timeOfDay: true,
    timezone: true,
  } satisfies Prisma.CheckScheduleSelect;
}

type ScheduleListSource = Prisma.CheckScheduleGetPayload<{
  select: ReturnType<typeof scheduleListSelect>;
}>;
export type ScheduleProvider = Awaited<ReturnType<typeof loadSerpProviderChain>>[number];
export type ScheduleRunProjectionInput = {
  keywords: readonly { device: string; locationId: string; text: string }[];
  serpDepth: number | null;
};
type ScheduleMemberGroup = {
  checkScheduleId: string | null;
  device: string;
  locationId: string;
  text: string;
};
type ScheduleTagAssignment = { keyword: { checkScheduleId: string | null }; tag: { name: string } };

function countLabel(count: number, singular: string) {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

function dayOfMonth(value: Date, timezone: string) {
  return ordinalDayOfMonth(
    Number(new Intl.DateTimeFormat("en-US", { day: "numeric", timeZone: timezone }).format(value)),
  );
}

function sharedTagScope(assignments: readonly ScheduleTagAssignment[], targetCount: number) {
  const counts = new Map<string, number>();
  for (const { tag } of assignments) counts.set(tag.name, (counts.get(tag.name) ?? 0) + 1);
  const shared = [...counts].filter(([, count]) => count === targetCount).map(([name]) => name);
  return shared.length === 1 ? `tag = ${shared[0]}` : null;
}

export function scheduleProviderId(policy: string | null) {
  return policy && policy !== "project" ? policy : undefined;
}

function scheduledRunProjectionCounts(
  schedule: { keywordCount: number; serpDepth: number | null; targetCount: number },
  projectDepth: number | null | undefined,
  provider: ScheduleProvider | undefined,
) {
  const costPerCheck = unitCostCentsFor(
    {
      overrideCents:
        provider?.costPerCheckCents == null ? null : Number(provider.costPerCheckCents),
      providerId: provider?.provider ?? null,
      rateContext: provider?.rateContext,
    },
    resolveSerpDepth(schedule.serpDepth ?? projectDepth ?? undefined),
  );
  return {
    estimatedCostCents:
      costPerCheck === null ? null : Math.ceil(costPerCheck * schedule.targetCount),
    keywordCount: schedule.keywordCount,
    targetCount: schedule.targetCount,
  };
}

export function scheduledRunProjection(
  schedule: ScheduleRunProjectionInput,
  projectDepth: number | null | undefined,
  provider: ScheduleProvider | undefined,
) {
  return scheduledRunProjectionCounts(
    {
      keywordCount: new Set(schedule.keywords.map((keyword) => keyword.text)).size,
      serpDepth: schedule.serpDepth,
      targetCount: schedule.keywords.length,
    },
    projectDepth,
    provider,
  );
}

function scheduleListDto(
  row: ScheduleListSource,
  memberGroups: readonly ScheduleMemberGroup[],
  projectDepth: number | null | undefined,
  projectTimezone: string | null | undefined,
  provider: ScheduleProvider | undefined,
  tagAssignments: readonly ScheduleTagAssignment[],
) {
  const { _count, id: _scheduleId, rankCheckRuns, ...schedule } = row;
  const timezone = schedule.timezone ?? projectTimezone ?? "UTC";
  const plannedFor = rankCheckRuns[0]?.plannedFor ?? null;
  const persistedCalendar = persistedScheduleCalendar(schedule.frequency, schedule.cronExpression);
  const projection = scheduledRunProjectionCounts(
    {
      keywordCount: new Set(memberGroups.map((keyword) => keyword.text)).size,
      serpDepth: schedule.serpDepth,
      targetCount: _count.keywords,
    },
    projectDepth,
    provider,
  );

  return {
    ...schedule,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    dayOfMonth:
      schedule.frequency === "monthly"
        ? (persistedCalendar.dayOfMonth ?? (plannedFor ? dayOfMonth(plannedFor, timezone) : null))
        : null,
    keywordCount: projection.keywordCount,
    memberMeta: `${countLabel(new Set(memberGroups.map((keyword) => keyword.locationId)).size, "market")} x ${countLabel(new Set(memberGroups.map((keyword) => keyword.device)).size, "device")}`,
    perRunCents: projection.estimatedCostCents,
    tagScope: sharedTagScope(tagAssignments, projection.targetCount),
    targetCount: projection.targetCount,
    weekday:
      schedule.frequency === "weekly"
        ? (persistedCalendar.weekday ??
          (plannedFor
            ? new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "long" }).format(
                plannedFor,
              )
            : null))
        : null,
  };
}

export async function listCheckScheduleRows(
  projectId: string,
  status: "current" | "archived" = "current",
) {
  const [defaults, activeLocationIds] = await Promise.all([
    getRequestProjectDefaults(projectId),
    activeMarketLocationIds(projectId, prisma),
  ]);
  const rows = await prisma.checkSchedule.findMany({
    orderBy: [{ isDefault: "desc" }, { name: "asc" }, { publicId: "asc" }],
    select: scheduleListSelect(activeLocationIds),
    where: { archivedAt: status === "archived" ? { not: null } : null, projectId },
  });
  const scheduleIds = rows.map((schedule) => schedule.id);
  const [memberGroups, tagAssignments, providers, assignedCounts] = await Promise.all([
    scheduleIds.length > 0
      ? prisma.keyword.groupBy({
          by: ["checkScheduleId", "device", "locationId", "text"],
          where: {
            ...runnableKeywordWhere(activeLocationIds),
            checkScheduleId: { in: scheduleIds },
            projectId,
          },
        })
      : Promise.resolve([]),
    scheduleIds.length > 0
      ? prisma.keywordTag.findMany({
          select: {
            keyword: { select: { checkScheduleId: true } },
            tag: { select: { name: true } },
          },
          where: {
            keyword: {
              ...runnableKeywordWhere(activeLocationIds),
              checkScheduleId: { in: scheduleIds },
              projectId,
            },
          },
        })
      : Promise.resolve([]),
    Promise.all(
      rows.map((schedule) =>
        loadSerpProviderChain(projectId, scheduleProviderId(schedule.providerPolicy)),
      ),
    ),
    prisma.keyword.groupBy({
      by: ["checkScheduleId"],
      _count: { _all: true },
      where: { projectId, checkScheduleId: { in: scheduleIds } },
    }),
  ]);
  return rows.map((schedule, index) => ({
    assignedKeywordCount:
      assignedCounts.find((group) => group.checkScheduleId === schedule.id)?._count._all ?? 0,
    ...scheduleListDto(
      schedule,
      memberGroups.filter((group) => group.checkScheduleId === schedule.id),
      defaults?.serpDepth,
      defaults?.timezone,
      providers[index]?.[0],
      tagAssignments.filter(({ keyword }) => keyword.checkScheduleId === schedule.id),
    ),
  }));
}
