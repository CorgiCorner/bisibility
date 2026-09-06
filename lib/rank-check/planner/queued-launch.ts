import "server-only";

import { prisma } from "@/lib/db/prisma";

const DEFAULT_LAUNCH_LIMIT = 100;
const MAX_LAUNCH_LIMIT = 500;

export type StartQueuedRankCheckRun = (input: {
  runId: string;
  workflowId: string;
}) => Promise<{ alreadyExists: boolean } | undefined>;

function boundedLimit(value?: number) {
  if (!Number.isFinite(value)) return DEFAULT_LAUNCH_LIMIT;
  return Math.min(MAX_LAUNCH_LIMIT, Math.max(1, Math.floor(value ?? DEFAULT_LAUNCH_LIMIT)));
}

export async function claimQueuedRankCheckRun(
  input: { now: Date; runId: string; startRun: StartQueuedRankCheckRun; workflowId: string },
  client: Pick<typeof prisma, "rankCheckRun"> = prisma,
) {
  const claimed = await client.rankCheckRun.updateMany({
    // A workflow start can be retried only after the reconciler proves this claim orphaned.
    data: { claimedAt: input.now },
    where: {
      claimedAt: null,
      id: input.runId,
      orchestrationWorkflowId: input.workflowId,
      status: "queued",
    },
  });
  if (claimed.count === 0) return { claimed: false, launched: false, runId: input.runId };

  const started = await input.startRun({ runId: input.runId, workflowId: input.workflowId });
  return { claimed: true, launched: !started?.alreadyExists, runId: input.runId };
}

export async function launchQueuedRankCheckRuns(
  input: { limit?: number; now?: Date; startRun: StartQueuedRankCheckRun },
  client: Pick<typeof prisma, "rankCheckRun"> = prisma,
) {
  const now = input.now ?? new Date();
  const rows = await client.rankCheckRun.findMany({
    orderBy: { id: "asc" },
    select: { id: true, orchestrationWorkflowId: true },
    take: boundedLimit(input.limit),
    where: { claimedAt: null, orchestrationWorkflowId: { not: null }, status: "queued" },
  });
  let claimed = 0;
  let launched = 0;
  for (const run of rows) {
    if (!run.orchestrationWorkflowId) continue;
    const result = await claimQueuedRankCheckRun(
      { now, runId: run.id, startRun: input.startRun, workflowId: run.orchestrationWorkflowId },
      client,
    );
    if (result.claimed) claimed += 1;
    if (result.launched) launched += 1;
  }
  return { claimed, launched, scanned: rows.length };
}
