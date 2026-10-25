import { inspectionBudgetModeSchema } from "@/lib/presence/budget-mode";
import { MAX_INSPECTION_DAILY_LIMIT } from "@/lib/presence/constants";
import { z } from "zod";

export const pageIndexingGroupSchema = z.enum([
  "indexed",
  "not_indexed",
  "inspection_failed",
  "not_checked",
]);
export const pageIndexingSettingsPatchSchema = z
  .object({
    budget_mode: inspectionBudgetModeSchema.optional(),
    inspection_daily_limit: z.number().int().min(0).max(MAX_INSPECTION_DAILY_LIMIT).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "Supply at least one setting.");

export const pageIndexingUrlsQuerySchema = z.object({
  group: pageIndexingGroupSchema.optional(),
  coverage_state: z.string().max(500).optional(),
  sitemap: z.string().max(2048).optional(),
  source: z.enum(["keyword_target", "sitemap", "manual"]).optional(),
  search: z.string().max(500).optional(),
  cursor: z.string().max(2048).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  changed_since: z.iso.datetime({ offset: true }).optional(),
  history: z.enum(["true", "false"]).default("false"),
});
