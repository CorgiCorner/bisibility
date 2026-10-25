import "server-only";
import { prisma } from "../db/prisma";
import type { AttemptStopReason } from "../provider-evidence/recovery/predicate";
import { getSchedulerTemporalClient } from "./scheduler-client";

const UUID = /^[a-f0-9-]{36}$/i;
const STOP_REASONS: Record<string, AttemptStopReason> = {
  COMPLETED: "workflow_completed",
  FAILED: "workflow_failed",
  CANCELED: "workflow_cancelled",
};
// Current queue bounds require at most 18 continuations. Never follow a reused workflow ID.
const MAX_CONTINUATIONS = 64;

export async function providerRecoveryWorkflowStop(
  checkId: string,
): Promise<AttemptStopReason | null> {
  const check = await prisma.rankCheck.findUnique({
    where: { id: checkId },
    select: {
      workflowRunId: true,
      queuedTask: { select: { batch: { select: { definitionWorkflowRunId: true } } } },
    },
  });
  const runId = check?.workflowRunId ?? check?.queuedTask?.batch.definitionWorkflowRunId;
  if (!runId || !UUID.test(runId)) return null;
  const client = await getSchedulerTemporalClient();
  for await (const workflow of client.workflow.list({ query: `RunId = '${runId}'`, pageSize: 1 })) {
    if (workflow.runId !== runId) continue;
    let current = runId,
      status = workflow.status.name;
    const seen = new Set([current]);
    for (let count = 0; status === "CONTINUED_AS_NEW" && count < MAX_CONTINUATIONS; count++) {
      const history = await client.workflow.getHandle(workflow.workflowId, current).fetchHistory();
      const next = history.events?.find(
        (event) => event.workflowExecutionContinuedAsNewEventAttributes,
      )?.workflowExecutionContinuedAsNewEventAttributes?.newExecutionRunId;
      if (!next || !UUID.test(next) || seen.has(next)) return null;
      seen.add(next);
      const successor = await client.workflow.getHandle(workflow.workflowId, next).describe();
      if (successor.workflowId !== workflow.workflowId || successor.runId !== next) return null;
      current = next;
      status = successor.status.name;
    }
    return STOP_REASONS[status] ?? null;
  }
  return null;
}
