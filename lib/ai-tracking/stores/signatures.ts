import type { PlanTrackingRunInput, PromptCategory } from "@/lib/ai-tracking/contract";
export interface TopicInput {
  paused?: boolean;
  name: string;
  description?: string | null;
}
export interface PromptInput {
  generationReference?: { generationId: string; draftId: string };
  providerDatasetReference?: { reportId: string; rowIndex: number };
  category?: PromptCategory;
  paused?: boolean;
  text: string;
  topicId?: string | null;
  label?: string | null;
}
export interface ScheduleInput {
  name: string;
  cron: string;
  timezone: string;
  enabled?: boolean;
  configuration: PlanTrackingRunInput;
  nextRunAt?: string | null;
}
