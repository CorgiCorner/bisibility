import { isPublicIdOfType } from "@/lib/db/public-id";
import type { RankCheckRunPreview } from "@/lib/rank-check/runs/preview";
import { runSelectionSpecSchema } from "@/lib/rank-check/runs/selection";
import { serpDepthValues } from "@/lib/serp/constants";
import { z } from "zod";

export const previewRankCheckRunActionSchema = z
  .object({
    depth: z.union(serpDepthValues.map((depth) => z.literal(depth))).optional(),
    projectId: z.string().refine((value) => isPublicIdOfType(value, "prj"), "Project not found."),
    providerId: z.string().trim().min(1).max(120).optional(),
    spec: runSelectionSpecSchema,
  })
  .strict();

export type PreviewRankCheckRunActionInput = z.infer<typeof previewRankCheckRunActionSchema>;
export type PreviewRankCheckRunActionResult = RankCheckRunPreview;
