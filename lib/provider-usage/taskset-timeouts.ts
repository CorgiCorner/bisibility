// Shared with workflow budgets; this module must remain sandbox-safe.
export const TASKSET_TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 30_000 } as const;
export const TASKSET_ADMISSION_MAX_ATTEMPTS = 3;
export const TASKSET_ADMISSION_RETRY_DELAY_MS = 250;
export const TASKSET_SUBMISSION_ACTIVITY_TIMEOUT = "6 minutes";
