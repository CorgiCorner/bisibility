import { TRACKING_ENGINES, TRACKING_SOURCES } from "@/lib/ai-tracking/contract";
import { isPublicIdOfType } from "@/lib/db/public-id-resources";
import { z } from "zod";

export type AiProjectEngineActionResult = { ok: true } | { ok: false; error: "unavailable" };

const projectId = z
  .string()
  .trim()
  .refine((value) => isPublicIdOfType(value, "prj"), "Use a prj_ reference.");

export const setAiProjectEngineSchema = z.object({
  enabled: z.boolean(),
  engine: z.enum(TRACKING_ENGINES),
  projectId,
  source: z.enum(TRACKING_SOURCES),
});
