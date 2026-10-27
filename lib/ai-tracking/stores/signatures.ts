import type { PlanTrackingRunInput } from "@/lib/ai-tracking/contract";
import type * as schema from "@/lib/ai-tracking/schema";
import type { z } from "zod";
export interface TopicInput extends z.input<typeof schema.topicInputSchema> {}
export interface PromptInput extends z.input<typeof schema.promptInputSchema> {}
export interface ScheduleInput extends z.input<typeof schema.scheduleInputSchema> {
  configuration: PlanTrackingRunInput;
}
