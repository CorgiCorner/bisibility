import "server-only";
import type { CheckRunTriggerFilter } from "@/lib/checks/contract";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { effectiveRunTrigger } from "@/lib/notifications/check-summaries/routing";

/** One ancestry read, including nested retries; invalid ancestry fails closed. */
export async function checkRunTriggerWhere(
  projectId: string,
  trigger?: CheckRunTriggerFilter,
): Promise<Prisma.RankCheckWhereInput> {
  if (!trigger || trigger === "all") return {};
  const runs = await prisma.rankCheckRun.findMany({
    where: { projectId },
    select: {
      id: true,
      projectId: true,
      trigger: true,
      source: true,
      parentRunId: true,
      requestedById: true,
      deletedAt: true,
    },
  });
  const ancestors = new Map(runs.map((run) => [run.id, run]));
  const ids = runs
    .filter((run) => effectiveRunTrigger(run, ancestors) === trigger)
    .map((run) => run.id);
  return trigger === "programmatic"
    ? { runId: { in: ids } }
    : { OR: [{ runId: { in: ids } }, { runId: null, trigger }] };
}
