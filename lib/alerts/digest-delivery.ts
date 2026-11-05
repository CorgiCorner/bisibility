import "server-only";

import { prisma } from "@/lib/db/prisma";
import { notificationTransaction } from "@/lib/notifications/transaction";
import {
  classifyDeliveryFailure,
  deliveryFailureMessage,
  deliveryStateForOutcomes,
} from "@/lib/temporal/delivery-failures";
import {
  type AlertDeliveryChannel,
  postSignedBody,
  sendSlackMessage,
  stampWebhookDelivery,
} from "./delivery";
import type { DeliveryCounts } from "./delivery-counts";
import { legacyDigestAdmission } from "./digest-legacy-admission";
import { reconcileDigestEntries, releaseStaleDigest } from "./digest-reconcile";
import { renderAlertDigest } from "./digest-render";
import { terminalizeDigest } from "./digest-terminalization";
import type { AlertDigestJob } from "./digest-types";
import { ALERT_DIGEST_JOB_MAX_ALERTS } from "./limits";
import { ALERT_NOT_DELIVERABLE, allAlertsDeliverable, digestRefusal } from "./send-gate";

export type AlertDigestDeliveryOutcome = {
  channel: AlertDeliveryChannel;
  counts?: DeliveryCounts;
  delivered: boolean;
  reason?: string;
  retried?: boolean;
  skipped?: boolean;
  unknown?: boolean;
  webhookEndpointId?: string;
};

export async function prepareAlertDigestDeliveryActivity(
  job: AlertDigestJob,
): Promise<AlertDigestJob | null> {
  const deliverableEntries = await reconcileDigestEntries(job);
  const alerts = deliverableEntries.map(({ alert }) => alert);
  const firstAlert = alerts[0];
  if (!firstAlert) return null;
  const rendered = renderAlertDigest({
    alerts,
    conditionType: job.conditionType,
    createdAt: new Date(job.createdAt),
    projectDomain: job.projectDomain,
    projectId: firstAlert.projectId,
    projectName: job.projectName,
    ruleId: firstAlert.ruleId,
    ruleName: job.ruleName,
    suppressedTodayCount: job.suppressedTodayCount,
  });
  return {
    ...job,
    alertIds: deliverableEntries.map(({ triggeredAlertId }) => triggeredAlertId),
    alerts,
    email: rendered.email,
    slackText: rendered.slackText,
    webhookBody: rendered.webhookBody,
  };
}

export { deliverAlertDigestEmailActivity } from "./digest-email";

export async function deliverAlertDigestSlackActivity(job: AlertDigestJob) {
  const admission = await legacyDigestAdmission(job);
  if (admission) return admission;
  if (!job.slackConnection?.enabled) return digestRefusal("Slack delivery is not configured.");
  if (
    !(await allAlertsDeliverable({
      alertIds: job.alertIds,
      projectId: job.projectId,
      ruleId: job.ruleId,
    }))
  ) {
    return digestRefusal(ALERT_NOT_DELIVERABLE);
  }
  try {
    const delivered = await sendSlackMessage(job.slackConnection, job.slackText);
    return delivered
      ? { delivered: true, skipped: false }
      : digestRefusal("Slack delivery is not configured.");
  } catch (error) {
    const errorMessage = deliveryFailureMessage(error, "Alert digest delivery failed.");
    throw classifyDeliveryFailure(error, "slack", errorMessage);
  }
}

export async function deliverAlertDigestWebhookActivity(input: {
  endpointId: string;
  job: AlertDigestJob;
}) {
  const admission = await legacyDigestAdmission(input.job);
  if (admission) return admission;
  if (
    !(await allAlertsDeliverable({
      alertIds: input.job.alertIds,
      projectId: input.job.projectId,
      ruleId: input.job.ruleId,
    }))
  ) {
    return digestRefusal(ALERT_NOT_DELIVERABLE);
  }
  const endpoint = await prisma.webhookEndpoint.findUnique({
    select: { enabled: true, hmacSecret: true, id: true, url: true },
    where: { id: input.endpointId },
  });
  if (!endpoint?.enabled) return digestRefusal("Webhook delivery is not configured.");
  try {
    await postSignedBody(endpoint, input.job.webhookBody);
    await stampWebhookDelivery(endpoint.id);
    return { delivered: true, skipped: false };
  } catch (error) {
    const errorMessage = deliveryFailureMessage(error, "Alert digest delivery failed.");
    throw classifyDeliveryFailure(error, "webhook", errorMessage);
  }
}

export async function finalizeAlertDigestDeliveryActivity(input: {
  job: AlertDigestJob;
  outcomes: AlertDigestDeliveryOutcome[];
}) {
  if (
    input.job.alertIds.length > ALERT_DIGEST_JOB_MAX_ALERTS ||
    input.job.alerts.length > ALERT_DIGEST_JOB_MAX_ALERTS
  ) {
    throw new Error(`Digest finalization supports at most ${ALERT_DIGEST_JOB_MAX_ALERTS} alerts.`);
  }
  if (!input.job.deliveryClaimToken) return { deliveryState: "skipped" as const };
  const deliveryState = deliveryStateForOutcomes(input.outcomes, "digested");
  // Requeue only when no attempt could have reached a transport: a refusal on a retried
  // attempt may follow one that the transport accepted.
  if (
    deliveryState === "skipped" &&
    input.outcomes.some((outcome) => outcome.reason === ALERT_NOT_DELIVERABLE) &&
    !input.outcomes.some((outcome) => outcome.retried)
  ) {
    return { deliveryState: await releaseStaleDigest(input.job) };
  }
  if (input.job.alertIds.length === 0) return { deliveryState: "skipped" as const };

  await notificationTransaction((tx) => terminalizeDigest(tx, { ...input, deliveryState }), {
    timeout: 20_000,
  });
  return { deliveryState };
}
