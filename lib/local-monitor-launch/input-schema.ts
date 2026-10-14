import { isPublicIdOfType } from "@/lib/db/public-id-resources";
import { monitorRetryRequestSchema } from "@/lib/local-monitor-retry/input-schema";
import { monitorRef } from "@/lib/local-monitor-store/schema";
import { localToken, projectRef } from "@/lib/local-monitoring-store/target-input-schema";
import { z } from "zod";

export const monitorPreviewSchema = z
  .object({
    projectId: projectRef,
    monitorId: monitorRef,
    expectedVersion: z.number().int().nonnegative(),
    connectionId: z.string().refine((value) => isPublicIdOfType(value, "conn")),
    idempotencyKey: localToken.max(128),
    retry: monitorRetryRequestSchema.optional(),
  })
  .strict();

export const monitorConnectionChoiceSchema = z
  .object({ connectionId: monitorPreviewSchema.shape.connectionId })
  .strict();

export type MonitorPreviewCommand = z.infer<typeof monitorPreviewSchema>;
