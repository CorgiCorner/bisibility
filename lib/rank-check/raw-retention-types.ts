export const RANK_CHECK_RAW_PURGE_BATCH_SIZE = 1000;
export const RANK_CHECK_RAW_PURGE_MAX_BATCHES_PER_ACTIVITY = 10;

export type PurgeRankCheckRawPayloadsProgress = {
  batchCount: number;
  cutoff: Date;
  retentionDays: number;
  updated: number;
};

export type PurgeRankCheckRawPayloadsInput = {
  cutoff?: Date;
  initialBatchCount?: number;
  initialUpdated?: number;
  maxBatches?: number;
  now?: Date;
  onBatchCompleted?: (progress: PurgeRankCheckRawPayloadsProgress) => Promise<void> | void;
  progressId?: string;
  retentionDays?: number | null;
};

export type PurgeRankCheckRawPayloadsSummary = {
  batchCount: number;
  batchSize: number;
  cutoff: Date | null;
  hasMore: boolean;
  retentionDays: number | null;
  updated: number;
};
