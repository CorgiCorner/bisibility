import { isPublicIdOfType } from "@/lib/db/public-id";
import type { LaunchRankCheckRunResult } from "@/lib/rank-check/runs/launch-types";
import { runSelectionSpecSchema } from "@/lib/rank-check/runs/selection";
import { serpDepthValues } from "@/lib/serp/constants";
import { z } from "zod";

export const launchRankCheckRunActionSchema = z
  .object({
    depth: z.union(serpDepthValues.map((depth) => z.literal(depth))).optional(),
    idempotencyKey: z.string().trim().min(8).max(128).optional(),
    previewToken: z.string().min(1),
    projectId: z.string().refine((value) => isPublicIdOfType(value, "prj"), "Project not found."),
    providerId: z.string().trim().min(1).max(120).optional(),
    spec: runSelectionSpecSchema,
  })
  .strict();

export type LaunchRankCheckRunActionInput = z.infer<typeof launchRankCheckRunActionSchema>;
export type LaunchRankCheckRunActionFailure = {
  code:
    | "budget_exhausted"
    | "no_provider"
    | "preview_expired"
    | "preview_mismatch"
    | "sample_project";
  message: string;
  status: "not_started";
};
export type LaunchRankCheckRunActionResult =
  | LaunchRankCheckRunActionFailure
  | LaunchRankCheckRunResult;
