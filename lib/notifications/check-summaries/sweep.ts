import "server-only";
import { prisma } from "@/lib/db/prisma";
import { recomputeCheckSummary } from "./deliver";
import { checkNotificationSummariesEnabled } from "./switch";
import { checkWindow, SUMMARY_GRACE_MS } from "./window";

/** No catch-up: only ends in the live grace interval may be considered. */
export async function sweepCheckNotificationSummaries(now = new Date()) {
  if (!checkNotificationSummariesEnabled()) return { evaluated: 0, writes: 0 };
  const earliestEnd = new Date(now.getTime() - SUMMARY_GRACE_MS);
  const window = checkWindow({ finishedAt: null, checkedAt: new Date(now.getTime() - 3_600_000) });
  let evaluated = 0,
    writes = 0;
  if (window.end > earliestEnd && window.end <= now) {
    const projects = await prisma.project.findMany({
      where: {
        keywords: {
          some: {
            rankChecks: {
              some: {
                terminalPersistedAt: { not: null },
                recoveryRestoredAt: null,
                OR: [
                  { finishedAt: { gte: window.start, lt: window.end } },
                  { finishedAt: null, checkedAt: { gte: window.start, lt: window.end } },
                ],
              },
            },
          },
        },
      },
      select: { id: true },
    });
    for (const project of projects) {
      try {
        writes += await recomputeCheckSummary({ kind: "scheduled", projectId: project.id, window });
        evaluated++;
      } catch {
        /* One project cannot stop other live windows. */
      }
    }
  }
  const runs = await prisma.rankCheckRun.findMany({
    where: {
      finishedAt: { gt: earliestEnd, lte: now },
      deletedAt: null,
      status: { in: ["completed", "cancelled"] },
      trigger: { in: ["manual", "retry"] },
    },
    select: { id: true, projectId: true },
  });
  for (const run of runs) {
    try {
      writes += await recomputeCheckSummary({
        kind: "manual",
        projectId: run.projectId,
        runId: run.id,
      });
      evaluated++;
    } catch {
      /* The next sweep retries only while the grace interval is open. */
    }
  }
  return { evaluated, writes };
}
