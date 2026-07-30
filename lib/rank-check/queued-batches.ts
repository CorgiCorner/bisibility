import type { SerpDevice } from "@/lib/providers/types";

export const DATAFORSEO_TASK_POST_LIMIT = 100;

export type QueuedRankCheckGroupInput = {
  claimedAt: string;
  device: SerpDevice | string;
  keywordIds: string[];
  locationId: string;
  projectId: string;
};

export type QueuedRankCheckBatchInput = QueuedRankCheckGroupInput & {
  chunkIndex: number;
};

export function chunkQueuedRankCheckGroup(
  input: QueuedRankCheckGroupInput,
): QueuedRankCheckBatchInput[] {
  const chunks: QueuedRankCheckBatchInput[] = [];
  for (let offset = 0; offset < input.keywordIds.length; offset += DATAFORSEO_TASK_POST_LIMIT) {
    chunks.push({
      ...input,
      chunkIndex: chunks.length,
      keywordIds: input.keywordIds.slice(offset, offset + DATAFORSEO_TASK_POST_LIMIT),
    });
  }
  return chunks;
}

function workflowIdPart(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
}

export function queuedBatchWorkflowId(input: QueuedRankCheckBatchInput) {
  const claimedAt = Date.parse(input.claimedAt);
  if (!Number.isFinite(claimedAt)) throw new Error("claimedAt must be an ISO timestamp.");
  return [
    "queued-rank-check",
    workflowIdPart(input.projectId),
    workflowIdPart(input.locationId),
    workflowIdPart(input.device),
    claimedAt,
    input.chunkIndex,
  ].join("-");
}
