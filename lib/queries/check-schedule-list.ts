import "server-only";

import { estimateRankUsage } from "@/lib/cost-estimate/native-usage";
import { unitCostCentsFor } from "@/lib/cost-estimate/project-estimate";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { loadSerpProviderChain } from "@/lib/rank-check/provider-chain-loader";
import { activeMarketLocationIds, runnableKeywordWhere } from "@/lib/rank-check/runnable";
import { persistedScheduleCalendar, scheduleWeekdayNames } from "@/lib/schedules/cadence-label";
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

function dayOfMonth(value: Date, timezone: string) {
  return Number(
    new Intl.DateTimeFormat("en-US", { day: "numeric", timeZone: timezone }).format(value),
  );
}

function weekday(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: timezone,
    year: "numeric",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((entry) => entry.type === type)?.value);
  return (
    scheduleWeekdayNames[
      new Date(Date.UTC(part("year"), part("month") - 1, part("day"))).getUTCDay()
    ] ?? null
  );
}

function sharedTag(assignments: readonly ScheduleTagAssignment[], targetCount: number) {
  const counts = new Map<string, number>();
  for (const { tag } of assignments) counts.set(tag.name, (counts.get(tag.name) ?? 0) + 1);
  const shared = [...counts].filter(([, count]) => count === targetCount).map(([name]) => name);
  return shared.length === 1 ? (shared[0] ?? null) : null;
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
  const nativePerTarget = estimateRankUsage(
    [resolveSerpDepth(schedule.serpDepth ?? projectDepth ?? undefined)],
    {
      providerId: provider?.provider ?? null,
      overrideCents:
        provider?.costPerCheckCents == null ? null : Number(provider.costPerCheckCents),
      rateContext: provider?.rateContext,
    },
  );
  return {
    nativeEstimate: {
      ...nativePerTarget,
      quantity:
        nativePerTarget.quantity === null
          ? null
          : Number((nativePerTarget.quantity * schedule.targetCount).toFixed(6)),
      unknownTargets: nativePerTarget.unknownTargets * schedule.targetCount,
    },
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
        ? persistedCalendar.dayOfMonth
          ? Number.parseInt(persistedCalendar.dayOfMonth, 10)
          : plannedFor
            ? dayOfMonth(plannedFor, timezone)
            : null
        : null,
    keywordCount: projection.keywordCount,
    memberDeviceCount: new Set(memberGroups.map((keyword) => keyword.device)).size,
    memberMarketCount: new Set(memberGroups.map((keyword) => keyword.locationId)).size,
    perRunCents: projection.estimatedCostCents,
    nativeEstimate: projection.nativeEstimate,
    sharedTag: sharedTag(tagAssignments, projection.targetCount),
    targetCount: projection.targetCount,
    weekday:
      schedule.frequency === "weekly"
        ? (persistedCalendar.weekday ?? (plannedFor ? weekday(plannedFor, timezone) : null))
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
