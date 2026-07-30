import type { QueuedRankCheckBatchInput } from "../rank-check/queued-batches";

export type QueuedRankCheckWorkflowInput = QueuedRankCheckBatchInput & {
  batchId?: string;
  polls?: number;
  preflightDeferredReason?: string;
  startedAt?: string;
};

export type QueuedBatchProgress = {
  completed: number;
  failed: number;
  pending: number;
  state: string;
};

export type PreparedQueuedBatch = {
  batchId: string;
  maxQueueAgeSeconds: number;
  persisted?: boolean;
  pollIntervalSeconds: number;
  startedAt: string;
  state: string;
};

export type QueuedBatchInspection = {
  ambiguous: number;
  deadlineReached: boolean;
  pending: number;
  ready: number;
  state: string;
  terminal: number;
};
