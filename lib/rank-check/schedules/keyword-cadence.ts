import "server-only";

import { normalizeSchedule, type StoredSchedule } from "@/lib/actions/_schedule";
import { ApiInputError } from "@/lib/api/errors";
import { writeAudit } from "@/lib/auth/audit";
import { makePublicId } from "@/lib/db/public-id";
import { Prisma } from "@/lib/generated/prisma/client";
import { lockProjectForProviderMutation } from "@/lib/provider-allocations/project-lock";
import { reconcilePlannedRunsForSchedule } from "@/lib/rank-check/planner/reconcile-schedule";
import { nextCanonicalCronRun } from "@/lib/rank-check/previous-cron";
import { resolveSerpDepth } from "@/lib/serp/constants";
import {
  type CheckScheduleRow,
  checkScheduleAudit,
  checkScheduleSelect,
  mirrorManualToKeywords,
  mirrorScheduleToKeywords,
} from "./service-membership";

type CadenceKeyword = { checkScheduleId: string | null; id: string; publicId: string };
type CadenceGroup = {
  input: StoredSchedule;
  providerPolicy: string | null;
  keywords: CadenceKeyword[];
};

/** Explicit cadence selection only. Call inside the caller's transaction, never for omitted input. */
export async function setKeywordCadence(
  tx: Prisma.TransactionClient,
  projectId: string,
  keywordIds: readonly string[],
  input: StoredSchedule,
  actorId: string | null,
) {
  const assignments = new Map<string, CheckScheduleRow | null>();
  if (keywordIds.length === 0) return assignments;
  if (input.frequency === "custom_cron") {
    let next: Date | null = null;
    try {
      if (input.cronExpression)
        next = nextCanonicalCronRun(input.cronExpression, new Date(), input.timezone);
    } catch {
      // Invalid calendar/parser input must fail before locks, writes or enrollment.
    }
    if (!next)
      throw new ApiInputError(
        "Custom cron requires a supported numeric five-field expression with a future occurrence.",
      );
  }
  await lockProjectForProviderMutation(tx, projectId);
  const keywords = await tx.keyword.findMany({
    select: {
      checkScheduleId: true,
      id: true,
      publicId: true,
      checkSchedule: { select: { serpDepth: true, providerPolicy: true } },
      schedule: { select: { serpDepth: true } },
    },
    where: { archivedAt: null, id: { in: [...keywordIds] }, projectId },
  });
  if (keywords.length === 0) return assignments;
  const ids = keywords.map(({ id }) => id);
  await tx.$queryRaw(
    Prisma.sql`SELECT "id" FROM "keywords" WHERE "id" IN (${Prisma.join(ids)}) ORDER BY "id" FOR UPDATE`,
  );
  const groups = new Map<string, CadenceGroup>();
  for (const keyword of keywords) {
    // An assigned schedule owns depth, including null inheritance. Frequency alone
    // must not expand the paid request or select a different provider.
    const retained =
      input.serpDepth === undefined
        ? keyword.checkSchedule
          ? keyword.checkSchedule.serpDepth
          : (keyword.schedule?.serpDepth ?? null)
        : input.serpDepth;
    const serpDepth = retained === null ? null : resolveSerpDepth(retained);
    const providerPolicy = keyword.checkSchedule?.providerPolicy ?? null;
    const key = JSON.stringify([serpDepth, providerPolicy]);
    const group: CadenceGroup = groups.get(key) ?? {
      input: { ...input, serpDepth },
      providerPolicy,
      keywords: [],
    };
    group.keywords.push(keyword);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    const schedule = await assignCadenceGroup(tx, projectId, group, actorId);
    for (const keyword of group.keywords) assignments.set(keyword.id, schedule);
  }
  return assignments;
}

async function assignCadenceGroup(
  tx: Prisma.TransactionClient,
  projectId: string,
  group: CadenceGroup,
  actorId: string | null,
) {
  const { input, providerPolicy, keywords } = group;
  const ids = keywords.map(({ id }) => id);
  let schedule = null;
  if (input.frequency !== "manual") {
    const cadence = {
      cronExpression: input.cronExpression,
      enabled: input.frequency !== "paused",
      frequency: input.frequency,
      jitterMinutes: input.jitterMinutes,
      providerPolicy,
      serpDepth: input.serpDepth ?? null,
      timeOfDay: null,
      timezone: input.timezone,
    };
    const project = await tx.project.findUnique({
      select: { defaults: { select: { timezone: true } } },
      where: { id: projectId },
    });
    const inheritedTimezone = project?.defaults?.timezone ?? "UTC";
    schedule = await tx.checkSchedule.findFirst({
      orderBy: { publicId: "asc" },
      select: checkScheduleSelect,
      where: {
        ...cadence,
        timezone: undefined,
        OR: [
          { timezone: input.timezone },
          ...(input.timezone === inheritedTimezone ? [{ timezone: null }] : []),
        ],
        archivedAt: null,
        projectId,
      },
    });
    if (!schedule) {
      schedule = await tx.checkSchedule.create({
        data: {
          ...cadence,
          isDefault: false,
          name: input.frequency,
          projectId,
          publicId: makePublicId("sch"),
        },
        select: checkScheduleSelect,
      });
      await writeAudit(
        {
          action: "check_schedule.create",
          actorId,
          after: checkScheduleAudit(schedule),
          projectId,
          targetId: schedule.publicId,
          targetType: "check_schedule",
        },
        tx,
      );
    }
  }
  await tx.keyword.updateMany({
    data: { checkScheduleId: schedule?.id ?? null },
    where: { id: { in: ids }, projectId },
  });
  if (schedule) await mirrorScheduleToKeywords(tx, projectId, schedule, ids);
  else await mirrorManualToKeywords(tx, projectId, ids, input.serpDepth);
  // Depth overrides are not touched by the shared cadence mirror.
  if (schedule && input.serpDepth !== undefined)
    await tx.keywordSchedule.updateMany({
      data: { serpDepth: input.serpDepth },
      where: { keywordId: { in: ids } },
    });
  for (const id of new Set([
    ...(schedule ? [schedule.id] : []),
    ...keywords.flatMap((row) => row.checkScheduleId ?? []),
  ])) {
    await reconcilePlannedRunsForSchedule(id, tx);
  }
  await writeAudit(
    {
      action: "keyword.bulk_set_frequency",
      actorId,
      after: {
        keywordIds: keywords.map(({ publicId }) => publicId),
        schedule: normalizeSchedule(input),
        checkScheduleId: schedule?.publicId ?? null,
      },
      projectId,
      targetId: keywords[0].publicId,
      targetType: "keyword",
    },
    tx,
  );
  return schedule;
}
