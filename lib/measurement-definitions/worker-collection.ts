import "server-only";
import { prisma } from "@/lib/db/prisma";
import {
  assertQueuedPersistenceLease,
  type QueuedPersistenceLease,
} from "@/lib/rank-check/queued-persistence-lease";
import type { QueuedTask } from "@/lib/rank-check/queued-results-load";
import { DefinitionUnavailableError } from "./errors";
import { readDefinitionBinding } from "./storage";

/** Current persistence custody plus original retained semantics. It grants no GET; callers separately renew own admission before each retrieval. No current source/head. */
export async function retainedQueuedDefinition(task: QueuedTask, lease: QueuedPersistenceLease) {
  return prisma.$transaction(async (tx) => {
    await assertQueuedPersistenceLease(tx, lease);
    const binding = await readDefinitionBinding(
      tx,
      task.keyword.projectId,
      task.keywordId,
      `queued-definition:${task.id}`,
      task.rankCheckId,
    );
    if (
      binding &&
      (binding.owner.queuedTaskId !== task.id || binding.request.providerId !== "dataforseo")
    )
      throw new DefinitionUnavailableError();
    return binding;
  });
}

export async function collectedQueuedDefinition(task: QueuedTask, lease: QueuedPersistenceLease) {
  const binding = await retainedQueuedDefinition(task, lease);
  if (!binding) throw new DefinitionUnavailableError();
  return binding;
}
