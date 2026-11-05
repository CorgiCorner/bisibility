import "server-only";

import { createHash } from "node:crypto";
import { defaultPushSender } from "@/lib/notifications/apns";
import { deleteInvalidPushToken, projectPushRecipients } from "@/lib/notifications/push-tokens";
import { nonRetryableFailure, rateLimitedFailure } from "@/lib/temporal/delivery-failures";
import { FENCED_DIGEST_MAX_ATTEMPTS } from "@/lib/temporal/digest-fencing";
import { Context } from "@temporalio/activity";
import { countedDeliveryStatus, PUSH_NOT_CONFIGURED_TYPE } from "./delivery-counts";
import { fencedDigestSend } from "./digest-send-fence";
import type { AlertDigestJob } from "./digest-types";
import { digestPushMessage } from "./push-content";
import { allAlertsDeliverable } from "./send-gate";

function canRetry() {
  try {
    return Context.current().info.attempt < FENCED_DIGEST_MAX_ATTEMPTS;
  } catch {
    return true;
  }
}

export async function deliverFencedAlertDigestPushActivity(job: AlertDigestJob) {
  const sender = defaultPushSender();
  const first = job.alerts[0];
  if (!sender)
    throw nonRetryableFailure("Push delivery is not configured.", PUSH_NOT_CONFIGURED_TYPE);
  if (!first) return { delivered: false, skipped: true };
  const recipients = await projectPushRecipients(job.projectId, sender.topic);
  const outcomes = [];
  for (const recipient of recipients) {
    const destination = createHash("sha256").update(recipient.token).digest("hex");
    outcomes.push(
      await fencedDigestSend(job, "push", destination, async () => {
        if (!(await allAlertsDeliverable(job))) return { delivered: false, skipped: true };
        const result = await sender.send(
          recipient.token,
          recipient.environment,
          digestPushMessage({
            alerts: job.alerts,
            projectDomain: job.projectDomain,
            projectId: first.projectId,
            ruleId: first.ruleId,
            ruleName: job.ruleName,
          }),
        );
        if (result.kind === "invalid_token")
          await deleteInvalidPushToken(recipient.token).catch(() => undefined);
        if (result.kind === "retryable" && result.status === 429) {
          if (canRetry()) throw rateLimitedFailure(result.reason, null);
          return { delivered: false, reason: result.reason };
        }
        if (result.kind === "retryable")
          return { delivered: false, unknown: true, reason: result.reason };
        return {
          delivered: result.kind === "sent",
          ...(result.kind === "sent" ? {} : { reason: result.reason }),
        };
      }),
    );
  }
  const counts = {
    acceptedCount: outcomes.filter((result) => result.delivered).length,
    failedCount: outcomes.filter(
      (result) => !result.delivered && !result.skipped && !result.unknown,
    ).length,
    unknownCount: outcomes.filter((result) => result.unknown).length,
  };
  return {
    counts,
    delivered: counts.acceptedCount > 0,
    unknown: counts.unknownCount > 0,
    skipped: countedDeliveryStatus(counts) === "skipped",
    reason: outcomes.find((result) => result.reason)?.reason,
  };
}
