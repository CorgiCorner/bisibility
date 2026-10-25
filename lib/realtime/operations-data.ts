import "server-only";

import { readOperationSnapshot, readRankDataRevision } from "@/lib/rank-check/runs/snapshot";

// Callers must authorize both before this read and before delivering its payload.
export async function readRealtimeOperations(projectId: string, userId: string) {
  const [operations, rankDataRevision] = await Promise.all([
    readOperationSnapshot(projectId, userId),
    readRankDataRevision(projectId),
  ]);
  return { operations, rankDataRevision };
}
