import { promptInputSchema, topicInputSchema } from "@/lib/ai-tracking/schema";
import { z } from "zod";
export const trackingTopicForm = topicInputSchema;
export const trackingPromptForm = promptInputSchema;
export const trackingConfigurationForm = z.object({
  source: z.enum(["consumer_scrape", "model_api", "google_aio"]),
  engine: z.enum(["chat_gpt", "gemini", "claude", "perplexity", "google"]),
  locale: z.string().trim().min(2).max(100),
  location: z.string().trim().min(2).max(100),
  model: z.string().max(200),
  credentialConnectionId: z.string().optional(),
  consent: z.boolean(),
  scheduleName: z.string().trim().min(1).max(200),
  cron: z.string().trim().min(1).max(200),
  timezone: z.string().trim().min(1).max(100),
  enabled: z.boolean(),
});
export const trackingPageSchema = z.object({
  cursor: z.string().max(512).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
