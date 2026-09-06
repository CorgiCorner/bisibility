export const RANK_CHECK_DISPATCHER_SCHEDULE_ID = "dispatcher-rank-checks";
export const RANK_CHECK_DISPATCHER_WORKFLOW_TYPE = "dispatchDueRankChecksWorkflow";
export const RANK_CHECK_RUN_CHILD_CONCURRENCY = 10;

// 1 minute activity timeout x 3 attempts = 3 minutes, plus child start and prepare commit.
export const RANK_CHECK_ITEM_CLAIM_LEASE_MS = 5 * 60_000;
export const RANK_CHECK_ITEM_CLAIM_MAX_ATTEMPTS = 3;
