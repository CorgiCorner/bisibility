import "server-only";

import { defaultPushSender } from "@/lib/notifications/apns";
import { nonRetryableFailure } from "@/lib/temporal/delivery-failures";
import { countedDeliveryStatus, PUSH_NOT_CONFIGURED_TYPE } from "./delivery-counts";
import { legacyDigestAdmission } from "./digest-legacy-admission";
import type { AlertDigestJob } from "./digest-types";
import { digestPushMessage } from "./push-content";
import { deliverPushToProject } from "./push-delivery";
import { ALERT_NOT_DELIVERABLE, allAlertsDeliverable, digestRefusal } from "./send-gate";

/**
 * Digested alerts (scheduled checks) become one summary push per device, so a
 * scheduled run never fans out into one notification per keyword. Skips when the
 * rule is off, an alert is no longer deliverable or no member has a registered device.
 */
export async function deliverAlertDigestPushActivity(job: AlertDigestJob) {
  const admission = await legacyDigestAdmission(job);
  if (admission) return admission;
  const { alertIds, projectId, ruleId } = job;
  if (!(await allAlertsDeliverable({ alertIds, projectId, ruleId }))) {
    return digestRefusal(ALERT_NOT_DELIVERABLE);
  }
  const sender = defaultPushSender();
  if (!sender)
    throw nonRetryableFailure("Push delivery is not configured.", PUSH_NOT_CONFIGURED_TYPE);
  const [first] = job.alerts;
  if (!first) return digestRefusal("No registered devices.");
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
  const counts = {
    acceptedCount: result.acceptedCount,
    failedCount: result.failedCount,
    unknownCount: result.unknownCount,
  };
  return {
    delivered: counts.acceptedCount > 0,
    skipped: countedDeliveryStatus(counts) === "skipped",
    counts,
  };
}
