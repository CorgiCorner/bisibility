import { monitorRetryApprovalSchema } from "@/lib/local-monitor-retry/input-schema";
import { localQuoteSchema, localToken, targetRef } from "@/lib/local-monitoring-store/schema";
import { z } from "zod";
import { monitorPreviewSchema } from "./input-schema";

export {
  type MonitorPreviewCommand,
  monitorConnectionChoiceSchema,
  monitorPreviewSchema,
} from "./input-schema";
export const monitorLaunchSchema = monitorPreviewSchema
  .extend({
    retry: monitorRetryApprovalSchema.optional(),
    revisionId: localToken,
    scheduleIntentId: localToken,
    quote: localQuoteSchema,
    targetIds: z
      .array(targetRef)
      .min(1)
      .max(100)
      .refine((ids) => new Set(ids).size === ids.length),
    consentToken: z.string().min(1).max(8192),
  })
  .strict();
export type MonitorLaunchCommand = z.infer<typeof monitorLaunchSchema>;
export type MonitorLaunchUnavailable =
  | "worker_unavailable"
  | "capability_unregistered"
  | "connection_unavailable"
  | "unsupported"
  | "pricing_unavailable";
export class MonitorLaunchUnavailableError extends Error {
  constructor(readonly reason: MonitorLaunchUnavailable) {
    super(reason);
  }
}
