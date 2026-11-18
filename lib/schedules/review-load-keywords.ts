import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { resolveSerpDepth } from "@/lib/serp/constants";
import { providerForPolicy, type ReviewCadence, rankUnitCents } from "./review-cost";
import {
  asCadence,
  idle,
  pack,
  projectSerpProviderId,
  quote,
  rankRow,
  rankSelect,
} from "./review-load-shared";

export async function loadKeywords(
  projectId: string,
  keywordIds: readonly string[],
  scheduleId: string | null,
  projectDepth: number,
  timezone: string,
  now: Date,
  db: Prisma.TransactionClient = prisma,
) {
  const keywords = await db.keyword.findMany({
    select: {
      checkSchedule: { select: rankSelect },
      checkScheduleId: true,
      id: true,
      measurementTargetEpoch: true,
      publicId: true,
    },
    where: { archivedAt: null, projectId, publicId: { in: [...keywordIds] } },
  });
  const groups = new Map<
    string,
    { cadence: ReviewCadence; members: number; policy: string | null }
  >();
  let manual = 0;
  for (const keyword of keywords) {
    const schedule = keyword.checkSchedule;
    if (
      !schedule?.enabled ||
      schedule.archivedAt ||
      schedule.frequency === "manual" ||
      schedule.frequency === "paused"
    ) {
      manual += 1;
      continue;
    }
    const key = schedule.publicId;
    const group = groups.get(key) ?? {
      cadence: asCadence(schedule, timezone),
      members: 0,
      policy: schedule.providerPolicy,
    };
    group.members += 1;
    groups.set(key, group);
  }
  const ordered = [...keywords].sort((left, right) =>
    left.publicId < right.publicId ? -1 : left.publicId > right.publicId ? 1 : 0,
  );
  const projectProvider = await projectSerpProviderId(db, projectId);
  const groupQuote = (group: { cadence: ReviewCadence; members: number; policy: string | null }) =>
    quote(
      group.cadence,
      group.members,
      rankUnitCents(
        resolveSerpDepth(group.cadence.serpDepth ?? projectDepth),
        providerForPolicy(group.policy, projectProvider),
      ),
    );
  if (!scheduleId) {
    const spendGroups = [...groups.values()].map((group) => ({
      after: idle(),
      before: groupQuote(group),
      providerAfter: null,
      providerBefore: group.policy,
    }));
    const loaded = pack(
      projectDepth,
      now,
      "manual",
      spendGroups[0]?.before ?? idle(),
      idle(),
      false,
      null,
      null,
      ordered.flatMap((keyword) => [
        keyword.publicId,
        keyword.checkScheduleId,
        keyword.measurementTargetEpoch,
      ]),
      {
        keywordPublicIds: ordered.map((keyword) => keyword.publicId),
        kind: "keywords",
        schedulePublicId: null,
      },
    );
    if (spendGroups.length > 0) loaded.spend.groups = spendGroups;
    return loaded;
  }
  const target = await rankRow(projectId, scheduleId, db);
  const afterCadence = asCadence(target, timezone);
  const runnable =
    afterCadence.enabled &&
    !afterCadence.archived &&
    afterCadence.frequency !== "manual" &&
    afterCadence.frequency !== "paused";
  const afterUnit = rankUnitCents(
    resolveSerpDepth(afterCadence.serpDepth ?? projectDepth),
    providerForPolicy(target.providerPolicy, projectProvider),
  );
  const afterQuote = (members: number) =>
    quote(runnable ? afterCadence : { ...afterCadence, enabled: false }, members, afterUnit);
  const spendGroups = [...groups.values()].map((group) => ({
    after: afterQuote(group.members),
    before: groupQuote(group),
    providerAfter: target.providerPolicy,
    providerBefore: group.policy,
  }));
  if (manual > 0) {
    spendGroups.push({
      after: afterQuote(manual),
      before: idle(),
      providerAfter: target.providerPolicy,
      providerBefore: null,
    });
  }
  const loaded = pack(
    projectDepth,
    now,
    "assign",
    spendGroups[0]?.before ?? idle(),
    afterQuote(keywords.length),
    manual > 0 && runnable,
    spendGroups[0]?.providerBefore ?? null,
    target.providerPolicy,
    [
      scheduleId,
      target.measurementEpoch,
      target.updatedAt,
      ...ordered.flatMap((keyword) => [
        keyword.publicId,
        keyword.checkScheduleId,
        keyword.measurementTargetEpoch,
      ]),
    ],
    {
      keywordPublicIds: ordered.map((keyword) => keyword.publicId),
      kind: "keywords",
      schedulePublicId: scheduleId,
    },
  );
  if (spendGroups.length > 0) loaded.spend.groups = spendGroups;
  return loaded;
}
