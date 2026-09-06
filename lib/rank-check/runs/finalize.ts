import type { Prisma } from "@/lib/generated/prisma/client";
import { ACTIVE_RUN_STATUSES } from "./contract";
import {
  pendingRunItemCount,
  type RunItemGroup,
  runCounterData,
  runCountsFromItemGroups,
} from "./counts";
import { outcomeFromCounts } from "./status";

type FinalizerClient = Pick<Prisma.TransactionClient, "rankCheckRun" | "rankCheckRunItem">;

export type FinalizableRankCheckRun = {
  id: string;
  projectId: string;
  requestedCount: number;
  status: string;
};

export function finalRunData(input: {
  groups: RunItemGroup[];
  now: Date;
  run: FinalizableRankCheckRun;
}) {
  const counts = runCountsFromItemGroups(input.groups, input.run.requestedCount);
  return {
    ...runCounterData(counts, input.groups),
    costCents: input.groups.reduce((sum, group) => sum + (group._sum.actualCostCents ?? 0), 0),
    finishedAt: input.now,
    outcome: outcomeFromCounts(counts),
    status: input.run.status === "cancelling" ? "cancelled" : "completed",
  };
}

export async function finalizeRankCheckRun(
  client: FinalizerClient,
  input: { groups?: RunItemGroup[]; now: Date; run: FinalizableRankCheckRun },
) {
  if (!ACTIVE_RUN_STATUSES.includes(input.run.status as (typeof ACTIVE_RUN_STATUSES)[number])) {
    return { finalized: false, projectId: input.run.projectId };
  }
  const groupedItems = input.groups
    ? undefined
    : await client.rankCheckRunItem.groupBy({
        _count: { _all: true },
        _sum: { actualCostCents: true },
        by: ["keywordId", "status"],
        where: { runId: input.run.id },
      });
  const groups = input.groups ?? (groupedItems as RunItemGroup[]);
  if (pendingRunItemCount(groups) > 0) {
    return { finalized: false, projectId: input.run.projectId };
  }
  const finalized = await client.rankCheckRun.updateMany({
    data: finalRunData({ groups, now: input.now, run: input.run }),
    where: { id: input.run.id, status: input.run.status },
  });
  return { finalized: finalized.count > 0, projectId: input.run.projectId };
}
