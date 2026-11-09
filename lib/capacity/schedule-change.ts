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
  const rows = await tx.keyword.findMany({
    where: { projectId, id: { in: [...keywordIds] }, archivedAt: null },
    select: {
      checkSchedule: true,
      schedule: true,
      project: { select: { defaults: true } },
    },
  });
  const seen = new Set<string>();
  for (const row of rows) {
    const source = row.checkSchedule ?? row.schedule ?? row.project.defaults;
    const before = source
      ? {
          ...source,
          enabled: row.checkSchedule
            ? row.checkSchedule.enabled && !row.checkSchedule.archivedAt
            : true,
        }
      : undefined;
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
