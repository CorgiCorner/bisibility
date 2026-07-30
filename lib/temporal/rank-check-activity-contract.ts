import type { RankCheckSchedulerMode } from "../rank-check/scheduler-mode";
import type { SerpDepth } from "../serp/markets";

export const PROVIDER_RATE_LIMITED_FAILURE = "provider_rate_limited";
export const PROJECT_READ_ONLY_FAILURE = "project_read_only";
export const BUDGET_EXHAUSTED_FAILURE = "budget_exhausted";
export const AUTOMATIC_EXECUTION_DISABLED_FAILURE = "automatic_execution_disabled";
export const RANK_CHECK_CLOSED_FAILURE = "rank_check_closed";

export type RankCheckExecutionSource = "ambiguous" | "dispatcher" | "legacy" | "manual";

export type AuthorizeRankCheckExecutionInput = {
  keywordId: string;
  scheduleId: string | null;
  source: RankCheckExecutionSource;
};

export type AuthorizeRankCheckExecutionResult = {
  allowed: boolean;
  mode: RankCheckSchedulerMode;
  reason: string | null;
  source: RankCheckExecutionSource;
};

export type RankCheckActivityInput = {
  depth?: SerpDepth;
  keywordId: string;
  providerId?: string;
  rankCheckId?: string;
};

export type RunRankCheckActivityInput = RankCheckActivityInput & {
  source: RankCheckExecutionSource;
};

export type CreateRunningRankCheckActivityInput = RankCheckActivityInput & {
  scheduleId: string | null;
  scheduledAt: Date | null;
  trigger: "manual" | "scheduled";
  workflowRunId: string;
};

export type RunningRankCheckActivityResult = { keywordId: string; rankCheckId: string };

export type DiscardRankCheckActivityInput = { rankCheckId: string; reason: string };

export type FailRankCheckActivityInput = {
  keywordId: string;
  message: string;
  providerId?: string;
  rankCheckId: string;
};

export type FailRankCheckActivityResult = { rankCheckId: string };

export type RankCheckActivitySuccess = {
  attempts: { provider: string; message: string }[];
  checkedAt: string;
  costCents: number;
  deferred?: false;
  keywordId: string;
  position: number | null;
  provider: string;
  rankCheckId: string;
  rankingUrl: string | null;
};

export type RankCheckActivityDeferred = {
  deferred: true;
  keywordId: string;
  reason: string;
};

export type RankCheckActivityResult = RankCheckActivitySuccess | RankCheckActivityDeferred;
