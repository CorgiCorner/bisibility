import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { PaidFenceHook } from "@/lib/metering/paid-attempt-types";
import type { claimQueuedSubmission } from "@/lib/rank-check/queued-submit-claim";
import { frozenRequest, sameDefinitionBytes } from "./canonical";
import { DefinitionConflictError, DefinitionUnavailableError } from "./errors";
import type { DefinitionTransaction } from "./model";
import { lockDefinitionSource, readDefinitionSource } from "./storage";
import { queuedDefinitionPermit } from "./worker-claim";
import { readAdmittedDefinitionIntent } from "./worker-intent";
import { captureWorkerDefinition, type WorkerDefinitionSession } from "./worker-session";

/** This staging read is inside the existing preparation tx; it never initializes policy/head. */
export async function queuedDefinitionRequests(
  tx: DefinitionTransaction,
  projectId: string,
  keywordIds: readonly string[],
  runItems?: ReadonlyMap<string, { id: string }>,
) {
  const requests = new Map<string, ReturnType<typeof frozenRequest>>();
  for (const keywordId of [...keywordIds].sort()) {
    await lockDefinitionSource(tx, projectId, keywordId);
    const source = await readDefinitionSource(tx, projectId, keywordId);
    const item = runItems?.get(keywordId);
    const intent = item
      ? await readAdmittedDefinitionIntent(tx, item.id, projectId, keywordId)
      : null;
    if (intent && !sameDefinitionBytes(source, intent.source)) throw new DefinitionConflictError();
    requests.set(keywordId, frozenRequest(source, "dataforseo", intent?.depth));
  }
  return requests;
}
/** Retained preparation is loaded on the current own workflow, never recaptured from result history. */
export async function queuedWorkerSessions(
  batch: Awaited<ReturnType<typeof claimQueuedSubmission>>["batch"],
) {
  if (!batch.connection) throw new DefinitionUnavailableError();
  return prisma.$transaction(async (tx) => {
    const sessions = new Map<string, WorkerDefinitionSession>();
    for (const task of [...batch.tasks].sort((a, b) => a.id.localeCompare(b.id))) {
      const permit = await queuedDefinitionPermit(tx, task.rankCheckId, false);
      sessions.set(
        task.id,
        await captureWorkerDefinition(tx, {
          permit,
          projectId: batch.projectId,
          keywordId: task.keywordId,
          connection: batch.connection!,
          queuedTaskId: task.id,
        }),
      );
    }
    return sessions;
  });
}
/** One original POST, one native fence commit. Every child must have exactly one semantic owner. */
export function queuedDefinitionFence(
  sessions: ReadonlyMap<string, WorkerDefinitionSession>,
): PaidFenceHook {
  const partition = (references: Parameters<PaidFenceHook["assertDispatch"]>[1]) => {
    if (!references.length || references.some((ref) => !sessions.has(ref.context.correlationId)))
      throw new DefinitionUnavailableError();
    return [...sessions]
      .sort(([, a], [, b]) => a.binding.keywordId.localeCompare(b.binding.keywordId))
      .map(([taskId, session]) => {
        const children = references.filter((ref) => ref.context.correlationId === taskId);
        if (children.length !== 1) throw new DefinitionUnavailableError();
        return { session, children };
      });
  };
  return {
    async lockBusiness(tx, references) {
      for (const { session, children } of partition(references))
        await session.beforeFence.lockBusiness(tx, children);
    },
    async assertDispatch(tx, references) {
      for (const { session, children } of partition(references))
        await session.beforeFence.assertDispatch(tx, children);
    },
  };
}
