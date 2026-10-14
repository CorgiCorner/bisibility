import type { SerpDevice } from "@/lib/providers/types";
import type { RankCheckClaimCompensation, RankCheckRunItemClaim } from "./dispatcher-types";

export const DATAFORSEO_TASK_POST_LIMIT = 100;

export type QueuedRankCheckGroupInput = {
  claimedAt: string;
  device: SerpDevice | string;
  keywordIds: string[];
  locationId: string;
  projectId: string;
  runId?: string;
  runItemIds?: string[];
  runItemClaims?: RankCheckRunItemClaim[];
  dispatchClaims?: RankCheckClaimCompensation[];
};

export type QueuedRankCheckBatchInput = QueuedRankCheckGroupInput & {
  chunkIndex: number;
};

export function chunkQueuedRankCheckGroup(
  input: QueuedRankCheckGroupInput,
): QueuedRankCheckBatchInput[] {
  if (input.runItemIds && input.runItemIds.length !== input.keywordIds.length) {
    throw new Error("runItemIds must align with keywordIds.");
  }
  if (
    input.runId &&
    (!input.runItemIds ||
      !input.runItemClaims ||
      input.runItemClaims.length !== input.keywordIds.length ||
      new Set(input.runItemIds).size !== input.runItemIds.length ||
      input.runItemClaims.some(
        (claim, index) =>
          claim.id !== input.runItemIds![index] ||
          !Number.isSafeInteger(claim.claimAttempts) ||
          claim.claimAttempts < 1 ||
          !Number.isFinite(Date.parse(claim.claimExpiresAt)),
      ))
  ) {
    throw new Error("The exact current run-item claim generation must align with keywords.");
  }
  const chunks: QueuedRankCheckBatchInput[] = [];
  for (let offset = 0; offset < input.keywordIds.length; offset += DATAFORSEO_TASK_POST_LIMIT) {
    chunks.push({
      ...input,
      chunkIndex: chunks.length,
      keywordIds: input.keywordIds.slice(offset, offset + DATAFORSEO_TASK_POST_LIMIT),
      ...(input.runItemIds
        ? { runItemIds: input.runItemIds.slice(offset, offset + DATAFORSEO_TASK_POST_LIMIT) }
        : {}),
      ...(input.runItemClaims
        ? { runItemClaims: input.runItemClaims.slice(offset, offset + DATAFORSEO_TASK_POST_LIMIT) }
        : {}),
      ...(input.dispatchClaims
        ? {
            dispatchClaims: input.dispatchClaims.filter((claim) =>
              input.keywordIds
                .slice(offset, offset + DATAFORSEO_TASK_POST_LIMIT)
                .includes(claim.keywordId),
            ),
          }
        : {}),
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
    ...(input.runId ? [workflowIdPart(input.runId)] : []),
    workflowIdPart(input.locationId),
    workflowIdPart(input.device),
    claimedAt,
    input.chunkIndex,
  ].join("-");
}
