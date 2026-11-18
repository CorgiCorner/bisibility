import { prepareResourceCapacity } from "@/lib/capacity/capacity-extension";
import { prepareKeywordScheduleChange } from "@/lib/capacity/schedule-change";
import {
  isReviewedKeywordCadence,
  type ReviewedKeywordCadence,
} from "@/lib/schedules/keyword-cadence-write";
import {
  assertKeywordCreateAdmission,
  type KeywordCreateReview,
} from "@/lib/schedules/keyword-create-write";
import "server-only";

import { normalizeSchedule, type StoredSchedule } from "@/lib/actions/_schedule";
import { ApiInputError } from "@/lib/api/errors";
import { writeAudit } from "@/lib/auth/audit";
import { makePublicId } from "@/lib/db/public-id";
import { Prisma } from "@/lib/generated/prisma/client";
import { lockProjectForProviderMutation } from "@/lib/provider-allocations/project-lock";
import { reconcilePlannedRunsForSchedule } from "@/lib/rank-check/planner/reconcile-schedule";
import { nextCanonicalCronRun } from "@/lib/rank-check/previous-cron";
import { effectiveKeywordDepth } from "./effective-keyword-depth";
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
  allowInheritedTimezone: boolean;
  providerPolicy: string | null;
  timeOfDay: string | null;
  timezone: string | null;
  keywords: CadenceKeyword[];
};

/** Explicit cadence selection only. Call inside the caller's transaction, never for omitted input. */
export async function setKeywordCadence(
  tx: Prisma.TransactionClient,
  projectId: string,
  keywordIds: readonly string[],
  input: StoredSchedule,
  actorId: string | null,
  source: "frequency" | "schedule",
  review?: KeywordCreateReview,
  cadenceAdmission?: ReviewedKeywordCadence,
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
  await prepareResourceCapacity(tx, { projectId: projectId, dimensions: [] });
  await lockProjectForProviderMutation(tx, projectId);
  const keywords = await tx.keyword.findMany({
    select: {
      checkScheduleId: true,
      id: true,
      publicId: true,
      checkSchedule: { select: checkScheduleSelect },
      schedule: { select: { serpDepth: true } },
    },
    where: { archivedAt: null, id: { in: [...keywordIds] }, projectId },
  });
  if (keywords.length === 0) return assignments;
  const ids = keywords.map(({ id }) => id);
  await tx.$queryRaw(
    Prisma.sql`SELECT "id" FROM "keywords" WHERE "id" IN (${Prisma.join(ids)}) ORDER BY "id" FOR UPDATE`,
  );
  const capacity = await prepareKeywordScheduleChange(tx, projectId, ids, {
    ...input,
    enabled: true,
  });
  const project = await tx.project.findUnique({
    select: { defaults: { select: { timezone: true } } },
    where: { id: projectId },
  });
  const inheritedTimezone = project?.defaults?.timezone ?? "UTC";
  const groups = new Map<string, CadenceGroup>();
  for (const keyword of keywords) {
    // An assigned schedule owns depth, including null inheritance. Frequency alone
    // must not expand the paid request or select a different provider.
    const serpDepth = effectiveKeywordDepth(input.serpDepth, keyword);
    const current = keyword.checkSchedule;
    const providerPolicy = current?.providerPolicy ?? null;
    const sameFrequency =
      current?.frequency === input.frequency &&
      (input.frequency !== "custom_cron" || current.cronExpression === input.cronExpression);
    const sameDepth = input.serpDepth === undefined || current?.serpDepth === serpDepth;
    const sameExplicitSettings =
      source === "frequency" ||
      (current?.timeOfDay === null &&
        (current.timezone === input.timezone ||
          (current.timezone === null && input.timezone === inheritedTimezone)) &&
        current.jitterMinutes === input.jitterMinutes);
    if (
      current &&
      !current.archivedAt &&
      current.enabled &&
      sameFrequency &&
      sameDepth &&
      sameExplicitSettings
    ) {
      assignments.set(keyword.id, current);
      continue;
    }
    const timeOfDay = source === "frequency" && current ? current.timeOfDay : null;
    const timezone = source === "frequency" && current ? current.timezone : input.timezone;
    const jitterMinutes =
      source === "frequency" && current ? current.jitterMinutes : input.jitterMinutes;
    const allowInheritedTimezone = source === "schedule" || !current;
    const key = JSON.stringify([
      serpDepth,
      providerPolicy,
      timeOfDay,
      timezone,
      jitterMinutes,
      allowInheritedTimezone,
    ]);
    const group: CadenceGroup = groups.get(key) ?? {
      input: { ...input, serpDepth, jitterMinutes },
      allowInheritedTimezone,
      providerPolicy,
      timeOfDay,
      timezone,
      keywords: [],
    };
    group.keywords.push(keyword);
    groups.set(key, group);
  }
  const { nextCheckAt: _nextCheckAt, ...reviewCadence } = input;
  const reviewed = isReviewedKeywordCadence(
    cadenceAdmission,
    tx,
    projectId,
    keywords.map((keyword) => keyword.publicId),
    reviewCadence,
    source,
  );
  for (const group of groups.values()) {
    if (!reviewed)
      await assertKeywordCreateAdmission(
        tx,
        projectId,
        group.keywords.map((keyword) => keyword.id),
        group.input,
        review,
      );
    const schedule = await assignCadenceGroup(tx, projectId, group, actorId, inheritedTimezone);
    for (const keyword of group.keywords) assignments.set(keyword.id, schedule);
  }
  await capacity.check();
  return assignments;
}

function generatedScheduleName(
  input: Pick<StoredSchedule, "frequency" | "cronExpression" | "serpDepth">,
) {
  const label =
    input.frequency === "custom_cron"
      ? `Cron ${input.cronExpression}`
      : `${input.frequency[0].toUpperCase()}${input.frequency.slice(1)}`;
  return `${label}, ${input.serpDepth == null ? "project depth" : `top ${input.serpDepth}`}`;
}

async function assignCadenceGroup(
  tx: Prisma.TransactionClient,
  projectId: string,
  group: CadenceGroup,
  actorId: string | null,
  inheritedTimezone: string,
) {
  const { input, providerPolicy, timeOfDay, timezone, keywords, allowInheritedTimezone } = group;
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
      timeOfDay,
      timezone,
    };
    schedule = await tx.checkSchedule.findFirst({
      orderBy: { publicId: "asc" },
      select: checkScheduleSelect,
      where: {
        ...cadence,
        ...(allowInheritedTimezone && timezone !== null && timezone === inheritedTimezone
          ? { timezone: undefined, OR: [{ timezone }, { timezone: null }] }
          : {}),
        archivedAt: null,
        projectId,
      },
    });
    if (!schedule) {
      schedule = await tx.checkSchedule.create({
        data: {
          ...cadence,
          name: generatedScheduleName(input),
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
  const appliedSchedule = schedule
    ? {
        ...normalizeSchedule({
          ...input,
          timezone: schedule.timezone ?? inheritedTimezone,
        }),
        timeOfDay: schedule.timeOfDay,
        timezone: schedule.timezone,
      }
    : normalizeSchedule(input);
  await writeAudit(
    {
      action: "keyword.bulk_set_frequency",
      actorId,
      after: {
        keywordIds: keywords.map(({ publicId }) => publicId),
        schedule: appliedSchedule,
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
