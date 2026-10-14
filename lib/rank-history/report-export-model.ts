import { isPublicIdOfType } from "@/lib/db/public-id";
import { z } from "zod";

export const historyExportRequestSchema = z
  .object({
    version: z.enum(["1", "2"]).default("1"),
    format: z.enum(["csv", "json"]).default("json"),
    granularity: z.enum(["daily", "weekly"]).default("daily"),
    keywordIds: z
      .array(z.string().refine((id) => isPublicIdOfType(id, "kw")))
      .max(500)
      .refine((ids) => new Set(ids).size === ids.length, "Selected keyword IDs must be unique")
      .optional(),
    range: z.enum(["30", "90", "all"]).default("30"),
    cursor: z.string().min(1).max(8192).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    stream: z.enum(["observations", "attempts"]).default("observations"),
    basis: z.enum(["observed_at", "recorded_at"]).default("recorded_at"),
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
    aggregation: z.literal("none").default("none"),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      Boolean(value.from) !== Boolean(value.to) ||
      (value.from && value.to && Date.parse(value.from) > Date.parse(value.to))
    )
      ctx.addIssue({ code: "custom", message: "A complete ordered export window is required" });
    if (
      value.version === "1" &&
      (value.from || value.to || value.stream !== "observations" || value.basis !== "recorded_at")
    )
      ctx.addIssue({
        code: "custom",
        message: "Explicit report windows/streams require version 2",
      });
    if (value.version === "2" && value.granularity !== "daily")
      ctx.addIssue({
        code: "custom",
        message: "Version 2 exports raw records; use aggregation=none",
      });
    if (value.stream === "attempts" && value.basis !== "recorded_at")
      ctx.addIssue({ code: "custom", message: "Attempt windows use recorded_at" });
    if (value.format === "csv" && value.cursor)
      ctx.addIssue({
        code: "custom",
        message: "CSV is a complete bounded export, not a partial cursor page",
      });
  });
export type HistoryExportRequest = z.infer<typeof historyExportRequestSchema>;
