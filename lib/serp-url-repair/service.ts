import "server-only";
import { prisma } from "@/lib/db/prisma";
import {
  assertComparisonAccess,
  assertComparisonHistoryWrite,
} from "@/lib/provider-comparison/access";
import { isResolvableRedirect } from "@/lib/providers/serp/redirect-resolution";
import { serpUrlRepairStatus, startSerpUrlRepair } from "@/lib/temporal/serp-url-repair-client";
import { repairedUrl, type UrlRepairTarget } from "./model";
import { loadRepairSource } from "./source";

async function repairContext(
  projectId: string,
  actorId: string,
  target: UrlRepairTarget,
  admission = false,
) {
  return prisma.$transaction(async (tx) => {
    if (admission) await assertComparisonAccess(tx, projectId, actorId, true);
    else await assertComparisonHistoryWrite(tx, projectId, actorId);
    const source = await loadRepairSource(tx, projectId, target);
    const remaining = source.rows.filter((row) =>
      isResolvableRedirect(repairedUrl(row.url, source.body._urlRepair)),
    );
    return {
      workflowId: `serp-url-repair:${projectId}:${source.id}:${source.hash.slice(0, 24)}`,
      sourceHash: source.hash,
      remaining: remaining.length,
    };
  });
}
/** Acknowledged by Temporal before the action reports that a durable job was queued. */
export async function enqueueUrlRepair(input: {
  projectId: string;
  actorId: string;
  target: UrlRepairTarget;
}) {
  const context = await repairContext(input.projectId, input.actorId, input.target, true);
  if (!context.remaining)
    return {
      status: "completed" as const,
      workflowId: context.workflowId,
      result: { resolved: 0, unresolved: 0 },
    };
  await startSerpUrlRepair({
    ...input,
    sourceHash: context.sourceHash,
    workflowId: context.workflowId,
  });
  return { status: "running" as const, workflowId: context.workflowId };
}
export async function readUrlRepairStatus(input: {
  projectId: string;
  actorId: string;
  target: UrlRepairTarget;
  workflowId: string;
}) {
  const context = await repairContext(input.projectId, input.actorId, input.target);
  if (context.workflowId !== input.workflowId) throw new Error("Saved results changed.");
  return serpUrlRepairStatus(context.workflowId);
}
