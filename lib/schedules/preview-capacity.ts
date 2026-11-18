import "server-only";
import { prepareResourceCapacity } from "@/lib/capacity/capacity-extension";
import type { ResourceCapacityProjection } from "@/lib/capacity/resource-change";
import { readKeywordCapacityCadences } from "@/lib/capacity/schedule-change";
import { prisma } from "@/lib/db/prisma";
import { cadenceIsActive } from "./review-cost";
import type { ScheduleSpend, SpendQuote } from "./review-decision";
import type { ScheduleChange } from "./review-load";
import type { ScheduleCapacityPreview } from "./review-preview";

const count = (quote: SpendQuote) => (cadenceIsActive(quote.cadence) ? quote.members : 0);

/** Uses the same capacity port as writes, with its read-only projection option. */
export async function previewScheduleCapacity(
  projectId: string,
  change: ScheduleChange,
  spend: ScheduleSpend,
): Promise<ScheduleCapacityPreview> {
  if (change.op === "state" && change.command.kind === "data_sync") return null;
  const admission = await prepareResourceCapacity(prisma, {
    projectId,
    dimensions: [],
    preview: { deltas: {} },
  });
  if (!admission.enabled) return null;
  const ai =
    change.op === "create" || change.op === "update"
      ? change.body.kind === "ai"
      : change.op === "state" && change.command.kind === "ai";
  let groups = spend.groups?.length ? spend.groups : [spend];
  const membership =
    change.op === "keywords"
      ? { ids: change.keywordIds, remove: change.scheduleId === null }
      : change.op === "update" && change.body.kind === "rank-membership"
        ? { ids: change.body.membership.keywordIds, remove: change.body.operation === "remove" }
        : null;
  if (membership) {
    const cadences = await readKeywordCapacityCadences(prisma, {
      projectId,
      publicId: { in: [...membership.ids] },
      archivedAt: null,
      ...(membership.remove && change.op === "update"
        ? { checkSchedule: { publicId: change.id } }
        : {}),
    });
    const grouped = new Map<string, { cadence: (typeof cadences)[number]; members: number }>();
    for (const cadence of cadences) {
      const key = JSON.stringify(
        cadence && [cadence.frequency, cadence.enabled, cadence.cronExpression, cadence.timezone],
      );
      const group = grouped.get(key) ?? { cadence, members: 0 };
      group.members += 1;
      grouped.set(key, group);
    }
    groups = [...grouped.values()].map(({ cadence, members }) => ({
      before: {
        cadence: cadence
          ? ({ ...cadence, archived: false } as NonNullable<SpendQuote["cadence"]>)
          : null,
        members,
        unitCents: 0,
      },
      after: { ...spend.after, members },
      providerBefore: null,
      providerAfter: null,
    }));
  }
  const delta = groups.reduce((sum, group) => sum + count(group.after) - count(group.before), 0);
  const dimensions: ResourceCapacityProjection = {};
  let enabled = false;
  for (const [index, group] of (groups.length
    ? groups
    : [{ before: spend.before, after: spend.after }]
  ).entries()) {
    const after = group.after.cadence;
    const before = group.before.cadence;
    const capacity = await prepareResourceCapacity(prisma, {
      projectId,
      dimensions: !ai && index === 0 ? ["scheduledKeywords"] : [],
      preview: { deltas: { scheduledKeywords: delta } },
      ...(after
        ? {
            cadence: {
              dimension: ai ? ("promptSchedules" as const) : ("scheduleFrequencies" as const),
              after: { ...after, enabled: cadenceIsActive(after) },
              ...(before ? { before: { ...before, enabled: cadenceIsActive(before) } } : {}),
            },
          }
        : {}),
    });
    enabled ||= capacity.enabled;
    for (const [key, value] of Object.entries(capacity.projection ?? {})) {
      const dimension = key as keyof ResourceCapacityProjection;
      const prior = dimensions[dimension];
      if (value && (!prior || value.exceeded || value.projected > prior.projected))
        dimensions[dimension] = value;
    }
  }
  return enabled
    ? { exceeded: Object.values(dimensions).some((value) => value?.exceeded), dimensions }
    : null;
}
