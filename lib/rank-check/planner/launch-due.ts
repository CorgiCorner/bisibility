import "server-only";

import { prisma } from "@/lib/db/prisma";
import { materializePlannedRun } from "./materialize";
import { claimQueuedRankCheckRun, type StartQueuedRankCheckRun } from "./queued-launch";

const DEFAULT_LAUNCH_LIMIT = 100;
const MAX_LAUNCH_LIMIT = 500;

export type StartPlannedRun = StartQueuedRankCheckRun;
export type DueRunCursor = { id: string; plannedFor: string };

function boundedLimit(value?: number) {
  if (!Number.isFinite(value)) return DEFAULT_LAUNCH_LIMIT;
  return Math.min(MAX_LAUNCH_LIMIT, Math.max(1, Math.floor(value ?? DEFAULT_LAUNCH_LIMIT)));
}

export async function launchPlannedRun(runId: string, startRun: StartPlannedRun, now = new Date()) {
  const materialized = await materializePlannedRun(runId, now);
  if (materialized !== "launch" && materialized !== "resume") return { launched: false, runId };
  const run = await prisma.rankCheckRun.findUniqueOrThrow({
    select: { orchestrationWorkflowId: true },
    where: { id: runId },
  });
  if (!run.orchestrationWorkflowId) throw new Error("Run workflow ID is missing.");
  const claimed = await claimQueuedRankCheckRun({
    now,
    runId,
    startRun,
    workflowId: run.orchestrationWorkflowId,
  });
  return { launched: claimed.claimed, runId };
}

export async function launchDuePlannedRuns(input: {
  cursor?: DueRunCursor | null;
  limit?: number;
  now?: Date;
  startRun: StartPlannedRun;
}) {
  const now = input.now ?? new Date();
  const cursor = input.cursor
    ? { id: input.cursor.id, plannedFor: new Date(input.cursor.plannedFor) }
    : null;
  const rows = await prisma.rankCheckRun.findMany({
    orderBy: [{ plannedFor: "asc" }, { id: "asc" }],
    select: { id: true, plannedFor: true },
    take: boundedLimit(input.limit) + 1,
    where: {
      ...(cursor
        ? {
            OR: [
              { plannedFor: { gt: cursor.plannedFor } },
              { id: { gt: cursor.id }, plannedFor: cursor.plannedFor },
            ],
          }
        : {}),
      plannedFor: { lte: now },
      status: { in: ["blocked", "planned"] },
    },
  });
  const limit = boundedLimit(input.limit);
  const runs = rows.slice(0, limit);
  let launched = 0;
  for (const run of runs) {
    const result = await launchPlannedRun(run.id, input.startRun, now);
    if (result.launched) launched += 1;
  }
  const last = runs.at(-1);
  return {
    cursor:
      rows.length > limit && last?.plannedFor
        ? { id: last.id, plannedFor: last.plannedFor.toISOString() }
        : null,
    hasMore: rows.length > limit,
    launched,
    scanned: runs.length,
  };
}
