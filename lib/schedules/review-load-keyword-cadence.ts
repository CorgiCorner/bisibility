import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { effectiveKeywordDepth } from "@/lib/rank-check/schedules/effective-keyword-depth";
import { resolveSerpDepth } from "@/lib/serp/constants";
import { cadenceIsActive, providerForPolicy, rankUnitCents } from "./review-cost";
import type { ScheduleChange } from "./review-load";
import {
  asCadence,
  idle,
  pack,
  projectSerpProviderId,
  quote,
  rankSelect,
} from "./review-load-shared";

export async function loadKeywordCadence(
  projectId: string,
  change: Extract<ScheduleChange, { op: "keyword-cadence" }>,
  projectDepth: number,
  timezone: string,
  now: Date,
  db: Prisma.TransactionClient = prisma,
) {
  const rows = await db.keyword.findMany({
    where: { archivedAt: null, projectId, publicId: { in: [...change.keywordIds] } },
    orderBy: { publicId: "asc" },
    select: {
      publicId: true,
      measurementTargetEpoch: true,
      checkSchedule: { select: rankSelect },
      schedule: { select: { serpDepth: true } },
    },
  });
  const provider = await projectSerpProviderId(db, projectId);
  const groups = rows.map((row) => {
    const current = row.checkSchedule;
    const preserved = change.source === "frequency" ? current : null;
    const policy = current?.providerPolicy ?? null;
    const depth = effectiveKeywordDepth(change.cadence.serpDepth, row);
    const unit = (value: number | null) =>
      rankUnitCents(resolveSerpDepth(value ?? projectDepth), providerForPolicy(policy, provider));
    const before = current
      ? quote(asCadence(current, timezone), 1, unit(current.serpDepth))
      : idle();
    const after = quote(
      {
        ...change.cadence,
        archived: false,
        enabled: true,
        publicId: current?.publicId ?? "keyword-cadence",
        serpDepth: depth ?? null,
        timeOfDay: preserved?.timeOfDay ?? null,
        timezone: preserved ? (preserved.timezone ?? timezone) : change.cadence.timezone,
        jitterMinutes: preserved?.jitterMinutes ?? change.cadence.jitterMinutes,
      },
      1,
      unit(depth ?? null),
    );
    const activeBefore = cadenceIsActive(before.cadence);
    const activeAfter = cadenceIsActive(after.cadence);
    const sameCadence = (
      [
        "cronExpression",
        "frequency",
        "jitterMinutes",
        "serpDepth",
        "timeOfDay",
        "timezone",
      ] as const
    ).every((key) => before.cadence?.[key] === after.cadence?.[key]);
    const unchanged =
      activeBefore === activeAfter &&
      (!activeAfter || (sameCadence && before.unitCents === after.unitCents));
    return { before, after, providerBefore: policy, providerAfter: policy, unchanged };
  });
  const operation =
    change.cadence.frequency === "manual"
      ? "manual"
      : change.cadence.frequency === "paused"
        ? "pause"
        : "update";
  const result = pack(
    projectDepth,
    now,
    operation,
    groups[0]?.before ?? idle(),
    groups[0]?.after ?? idle(),
    false,
    null,
    null,
    [projectDepth, timezone, provider, rows],
  );
  result.spend.groups = groups;
  return result;
}
