import { agentReportIdSchema } from "@/lib/agent-reports/model";
import { trackingTopicForm } from "@/lib/ai-tracking/projections/forms";
import { z } from "zod";

export const researchKeywordSchema = z.string().trim().min(1).max(100);
export const promptResearchSearchSchema = z.object({ keyword: researchKeywordSchema });
export const promptResearchSchema = z
  .object({
    keyword: researchKeywordSchema.transform((value) =>
      value.normalize("NFKC").replace(/\s+/g, " ").toLowerCase(),
    ),
    platform: z.literal("chat_gpt").default("chat_gpt"),
    location_code: z.literal(2840).default(2840),
    language_code: z.literal("en").default("en"),
    limit: z.literal(100).default(100),
    payment_option_id: z.string().min(1).max(120).optional(),
    accepted_payment: z
      .object({ quote_token: z.string().min(1).max(12000) })
      .strict()
      .optional(),
    require_payment: z.boolean().optional(),
    estimate_only: z.boolean().default(false),
    fresh: z.boolean().default(false),
    max_cost_cents: z.number().int().min(0).max(1000),
  })
  .strict();
export type PromptResearchInput = z.infer<typeof promptResearchSchema>;
export function researchMatchType(keyword: string) {
  return keyword.split(/\s+/).filter(Boolean).length <= 3 ? "partial_match" : "word_match";
}
export const researchTrackSchema = z
  .object({
    reportId: agentReportIdSchema,
    rowIndices: z.array(z.number().int().min(0).max(99)).min(1).max(100),
    topic: trackingTopicForm.shape.name,
  })
  .strict();
export const researchTopicSchema = researchTrackSchema.pick({ topic: true });
