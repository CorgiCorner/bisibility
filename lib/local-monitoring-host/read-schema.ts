import { projectRef, runRef, targetRef } from "@/lib/local-monitoring-store/schema";
import { z } from "zod";
export const localHostRunReadSchema = z.object({ projectId: projectRef, runId: runRef }).strict();
export const localHostItemReadSchema = localHostRunReadSchema
  .extend({ targetId: targetRef })
  .strict();
export type LocalHostRunReadCommand = z.infer<typeof localHostRunReadSchema>;
