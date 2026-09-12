import "server-only";

import { ApiConflictError, ApiNotFoundError } from "@/lib/api/errors";
import { requiredPublicAuditId, writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import { publishOperationChanged } from "@/lib/notifications/realtime";
import { skipPlannedRun } from "@/lib/rank-check/planner/skip-run-now";
import { runItemRankCheckWorkflowId } from "@/lib/temporal/client";
import { getSchedulerTemporalClient } from "@/lib/temporal/scheduler-client";
import { cancelRankCheckRun, closeRankCheckAsCancelled } from "./cancel";
import { TERMINAL_RUN_STATUSES } from "./contract";

const transactionOptions = { maxWait: 10_000, timeout: 60_000 } as const;

function logTemporalError(error: unknown) {
  console.error("[rank-check-runs] Temporal cancellation failed.", error);
}

export async function cancelRankCheckRunCommand(input: {
  actorId: string;
  projectId: string;
  publicId: string;
}) {
  const claimed = await prisma.$transaction(async (tx) => {
    const run = await tx.rankCheckRun.findFirst({
      select: {
        id: true,
        items: {
          select: { id: true, keywordId: true, rankCheckId: true },
          where: { status: "running" },
        },
        orchestrationWorkflowId: true,
        queuedRankCheckBatches: {
          select: { id: true },
          where: {
            state: { in: ["ambiguous", "prepared", "ready", "submitted", "submitting"] },
          },
        },
        status: true,
      },
      where: { projectId: input.projectId, publicId: input.publicId },
    });
    if (!run) throw new ApiNotFoundError("Rank-check run not found.");
    if (run.status === "cancelled" || run.status === "cancelling") return run;
    if (!(await cancelRankCheckRun(tx, run.id))) {
      throw new ApiConflictError("Only queued or running runs can be cancelled.");
    }
    await writeAudit(
      {
        action: "rank_check_run.cancel",
        actorId: input.actorId,
        after: { status: "cancelling" },
        projectId: input.projectId,
        targetId: requiredPublicAuditId(input.publicId, "rcr", "Rank-check run"),
        targetType: "rank_check_run",
      },
      tx,
    );
    return run;
  }, transactionOptions);
  await publishOperationChanged({ projectId: input.projectId }).catch(() => undefined);

  let client: Awaited<ReturnType<typeof getSchedulerTemporalClient>> | null = null;
  try {
    client = await getSchedulerTemporalClient();
  } catch (error) {
    logTemporalError(error);
  }
  const workflowIds = [
    ...(claimed.orchestrationWorkflowId ? [claimed.orchestrationWorkflowId] : []),
    ...claimed.queuedRankCheckBatches.map((batch) => batch.id),
  ];
  for (const workflowId of workflowIds) {
    try {
      await client?.workflow.getHandle(workflowId).cancel();
    } catch (error) {
      logTemporalError(error);
    }
  }
  for (const item of claimed.items) {
    try {
      if (client) {
        await client.workflow
          .getHandle(runItemRankCheckWorkflowId(item.keywordId, item.id))
          .cancel();
      }
    } catch (error) {
      logTemporalError(error);
    } finally {
      if (item.rankCheckId) {
        await prisma.$transaction(
          (tx) => closeRankCheckAsCancelled(tx, item.rankCheckId as string),
          transactionOptions,
        );
      }
    }
  }
}

export async function skipRankCheckRunCommand(input: {
  actorId: string;
  projectId: string;
  runId: string;
  publicId: string;
}) {
  return prisma.$transaction(async (tx) => {
    const run = await tx.rankCheckRun.findFirst({
      select: {
        checkSchedule: { select: { name: true } },
        plannedFor: true,
        publicId: true,
      },
      where: { id: input.runId, projectId: input.projectId },
    });
    if (!run) throw new ApiNotFoundError("Rank-check run not found.");
    if (!(await skipPlannedRun(tx, input.runId))) {
      throw new ApiConflictError("Only planned runs can be skipped.");
    }
    await writeAudit(
      {
        action: "rank_check_run.skip",
        actorId: input.actorId,
        after: {
          plannedFor: run.plannedFor?.toISOString() ?? null,
          publicId: run.publicId,
          schedule: run.checkSchedule?.name ?? "Schedule",
          status: "cancelled",
        },
        projectId: input.projectId,
        targetId: requiredPublicAuditId(run.publicId, "rcr", "Rank-check run"),
        targetType: "rank_check_run",
      },
      tx,
    );
  }, transactionOptions);
}

export async function deleteRankCheckRunCommand(input: {
  actorId: string;
  projectId: string;
  publicId: string;
}) {
  await prisma.$transaction(async (tx) => {
    const run = await tx.rankCheckRun.findFirst({
      select: { id: true, status: true },
      where: { projectId: input.projectId, publicId: input.publicId },
    });
    if (!run) throw new ApiNotFoundError("Rank-check run not found.");
    const removed = await tx.rankCheckRun.updateMany({
      data: { deletedAt: new Date() },
      where: {
        id: run.id,
        projectId: input.projectId,
        deletedAt: null,
        status: { in: [...TERMINAL_RUN_STATUSES] },
      },
    });
    if (removed.count !== 1)
      throw new ApiConflictError("Only completed or cancelled runs can be deleted.");
    await writeAudit(
      {
        action: "rank_check_run.delete",
        actorId: input.actorId,
        before: { status: run.status },
        projectId: input.projectId,
        targetId: requiredPublicAuditId(input.publicId, "rcr", "Rank-check run"),
        targetType: "rank_check_run",
      },
      tx,
    );
  }, transactionOptions);
  await publishOperationChanged({ projectId: input.projectId }).catch(() => undefined);
}
