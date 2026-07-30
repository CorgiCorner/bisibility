import type {
  RankCheckActivityInput,
  RankCheckActivityResult,
} from "./rank-check-activity-contract";

export type RankCheckWorkflowInput = RankCheckActivityInput & {
  dispatch?: {
    scheduleId: string;
    scheduledAt: string;
  };
};

export type RankCheckWorkflowResult = RankCheckActivityResult;
