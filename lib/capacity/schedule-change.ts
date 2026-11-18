import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import { prepareResourceCapacity } from "./capacity-extension";
import type { CapacityCadence } from "./resource-change";

export async function prepareKeywordScheduleChange(
  tx: Prisma.TransactionClient,
  projectId: string,
  keywordIds: readonly string[],
  after: CapacityCadence,
) {
  const capacity = await prepareResourceCapacity(tx, {
    projectId,
    dimensions: ["scheduledKeywords"],
  });
  if (!capacity.enabled || keywordIds.length === 0) return capacity;
  const beforeCadences = await readKeywordCapacityCadences(tx, {
    projectId,
    id: { in: [...keywordIds] },
    archivedAt: null,
  });
  const seen = new Set<string>();
  for (const before of beforeCadences) {
    const key = JSON.stringify(
      before && [before.frequency, before.enabled, before.cronExpression, before.timezone],
    );
    if (seen.has(key)) continue;
    seen.add(key);
    await prepareResourceCapacity(tx, {
      projectId,
      dimensions: [],
      cadence: { dimension: "scheduleFrequencies", before, after },
    });
  }
  return capacity;
}

/** The effective cadence used by capacity, including legacy overrides and defaults. */
export async function readKeywordCapacityCadences(
  tx: Prisma.TransactionClient,
  where: Prisma.KeywordWhereInput,
): Promise<(CapacityCadence | undefined)[]> {
  const rows = await tx.keyword.findMany({
    where,
    select: { checkSchedule: true, schedule: true, project: { select: { defaults: true } } },
  });
  return rows.map((row) => {
    const source = row.checkSchedule ?? row.schedule ?? row.project.defaults;
    return source
      ? {
          ...source,
          enabled: row.checkSchedule
            ? row.checkSchedule.enabled && !row.checkSchedule.archivedAt
            : true,
        }
      : undefined;
  });
}
