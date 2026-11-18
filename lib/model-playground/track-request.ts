import { z } from "zod";
export const trackRequestSchema = z
  .object({
    projectRef: z.string().min(1).max(256),
    runId: z.uuid(),
    topicId: z.string().min(1).max(256).nullable(),
  })
  .strict();
