import "server-only";
import { randomUUID } from "node:crypto";
import { Context } from "@temporalio/activity";
import { DefinitionUnavailableError } from "./errors";
import type { DefinitionTransaction } from "./model";

export type DefinitionExecutionPrincipal = Readonly<{
  actorId: string | null;
  runId: string;
  runItemId: string;
  source: string | null;
  trigger: string;
  credentialKind: string | null;
  credentialId: string | null;
  selectionKind: string;
  selectionHash: string;
  checkScheduleId: string | null;
}>;
export type DefinitionExecutionPermit = Readonly<{
  rankCheckId: string;
  workflowId: string;
  workflowRunId: string;
  token: string;
  principal: DefinitionExecutionPrincipal;
}>;
const permits = new WeakSet<object>();
export function assertDefinitionExecutionPermit(permit: DefinitionExecutionPermit) {
  if (!permits.has(permit)) throw new DefinitionUnavailableError();
}
/** Queue preparation/submit are invoked by the actual owning Temporal workflow. */
export async function queuedDefinitionPermit(
  tx: DefinitionTransaction,
  rankCheckId: string,
  prepare: boolean,
) {
  const invocation = definitionWorkerInvocation();
  if (prepare) {
    const token = randomUUID();
    await tx.$executeRaw`UPDATE rank_checks SET "definitionExecutionToken"=${token},"definitionWorkflowId"=${invocation.workflowId},"definitionExecutionPrincipal"=measurement_worker_principal(id)
      WHERE id=${rankCheckId} AND status='running' AND "workflowRunId"=${invocation.workflowRunId} AND "definitionExecutionToken" IS NULL`;
  }
  const rows = await tx.$queryRaw<
    Array<{ token: string; principal: DefinitionExecutionPrincipal }>
  >`
    SELECT "definitionExecutionToken" AS token,"definitionExecutionPrincipal" AS principal FROM rank_checks WHERE id=${rankCheckId}
      AND status='running' AND "workflowRunId"=${invocation.workflowRunId} AND "definitionWorkflowId"=${invocation.workflowId}
      AND "definitionExecutionToken" IS NOT NULL FOR UPDATE`;
  if (rows.length !== 1) throw new DefinitionUnavailableError();
  const permit = Object.freeze({
    rankCheckId,
    ...invocation,
    token: rows[0].token,
    principal: Object.freeze(rows[0].principal),
  });
  permits.add(permit);
  return permit;
}
/** The worker context owns these values. Neither run JSON nor an activity payload supplies them. */
export function definitionWorkerInvocation() {
  const { workflowExecution } = Context.current().info;
  if (!workflowExecution?.workflowId || !workflowExecution.runId)
    throw new DefinitionUnavailableError();
  return { workflowId: workflowExecution.workflowId, workflowRunId: workflowExecution.runId };
}
/** Atomically replaces the existing paid-call CAS, not another admission or provider attempt. */
export async function claimDefinitionPaidCall(
  tx: DefinitionTransaction,
  rankCheckId: string,
  inline: boolean,
): Promise<DefinitionExecutionPermit | null> {
  const invocation = inline
    ? await inlineInvocation(tx, rankCheckId)
    : definitionWorkerInvocation();
  const token = randomUUID();
  const rows = await tx.$queryRaw<Array<{ id: string; principal: DefinitionExecutionPrincipal }>>`
    UPDATE rank_checks SET "attemptCount"=1,"definitionExecutionToken"=${token},
      "definitionWorkflowId"=${invocation.workflowId},"definitionExecutionPrincipal"=measurement_worker_principal(id),"updatedAt"=CURRENT_TIMESTAMP
    WHERE id=${rankCheckId} AND status='running' AND "attemptCount"=0
      AND "workflowRunId"=${invocation.workflowRunId} AND "definitionExecutionToken" IS NULL
    RETURNING id,"definitionExecutionPrincipal" AS principal`;
  if (rows.length !== 1) return null;
  const permit = Object.freeze({
    rankCheckId,
    ...invocation,
    token,
    principal: Object.freeze(rows[0].principal),
  });
  permits.add(permit);
  return permit;
}
async function inlineInvocation(tx: DefinitionTransaction, rankCheckId: string) {
  // API credentials retain their matching actor identity. Fresh authorization still runs
  // through definitionWorkerHost before capture and again inside the native dispatch fence.
  const rows = await tx.$queryRaw<Array<{ publicId: string; workflowRunId: string | null }>>`
    SELECT r."publicId",c."workflowRunId" FROM rank_checks c
    JOIN rank_check_run_items i ON i."rankCheckId"=c.id AND i."runId"=c."runId"
    JOIN rank_check_runs r ON r.id=i."runId"
    WHERE c.id=${rankCheckId} AND c.status='running' AND i.status='running'
      AND r.status IN ('queued','running')
      AND ((r.trigger='manual' AND r."requestedById" IS NOT NULL AND r."credentialKind" IS NULL AND r."credentialId" IS NULL) OR
        (r.trigger='api' AND r.source IN ('api','sdk','cli','mcp') AND length(r."credentialId")>0
          AND ((r."credentialKind"='project_key' AND r."requestedById" IS NULL) OR
            (r."credentialKind" IN ('personal_token','oauth_client') AND r."requestedById" IS NOT NULL))))
    FOR UPDATE OF r,i,c`;
  const row = rows[0];
  if (rows.length !== 1 || row.workflowRunId !== `inline-${row.publicId}`)
    throw new DefinitionUnavailableError();
  return { workflowId: row.workflowRunId, workflowRunId: row.workflowRunId };
}
