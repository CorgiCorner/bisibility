import "server-only";

import { defaultPushSender } from "@/lib/notifications/apns";
import { nonRetryableFailure } from "@/lib/temporal/delivery-failures";
import type { AlertDigestJob } from "./digest-types";
import { digestPushMessage } from "./push-content";
import { deliverPushToProject } from "./push-delivery";

/**
 * Digested alerts (scheduled checks) become one summary push per device, so a
 * scheduled run never fans out into one notification per keyword. Returns
 * false when no member has a registered device.
 */
export async function deliverAlertDigestPushActivity(job: AlertDigestJob): Promise<boolean> {
  const sender = defaultPushSender();
  if (!sender) throw nonRetryableFailure("Push delivery is not configured.");
  const [first] = job.alerts;
  if (!first) return false;
  const result = await deliverPushToProject(
    sender,
    job.projectId,
    digestPushMessage({
      alerts: job.alerts,
      projectDomain: job.projectDomain,
      projectId: first.projectId,
      ruleId: first.ruleId,
      ruleName: job.ruleName,
    }),
  );
  if (result.sent > 0) return true;
  if (result.failures.length === 0) return false;
  const message = `Push delivery failed: ${[...new Set(result.failures)].join(", ")}`;
  if (result.retryable) throw new Error(message);
  throw nonRetryableFailure(message);
}
