// Frozen legacy implementation from 25351a5bd33132bd0de51fa699867c703ce98835.

import type { AlertDigestJob } from "@/lib/alerts/digest-types";
import type {
  AlertDeliveryContext,
  AlertDeliveryOutcome,
  AlertDigestDeliveryOutcome,
  claimAlertDeliveryActivity as claimActivity,
  deliverAlertDigestEmailActivity as digestEmailActivity,
  deliverAlertDigestPushActivity as digestPushActivity,
  deliverAlertDigestSlackActivity as digestSlackActivity,
  deliverAlertDigestWebhookActivity as digestWebhookActivity,
  deliverAlertEmailActivity as emailActivity,
  finalizeAlertDeliveryActivity as finalizeActivity,
  finalizeAlertDigestDeliveryActivity as finalizeDigestActivity,
  loadAlertDeliveryContextActivity as loadActivity,
  prepareAlertDigestDeliveryActivity as prepareDigestActivity,
  deliverAlertPushActivity as pushActivity,
  reserveAlertDeliveryBudgetActivity as reserveBudgetActivity,
  deliverAlertSlackActivity as slackActivity,
  sweepAlertDeliveriesActivity as sweepActivity,
  deliverAlertWebhookActivity as webhookActivity,
} from "@/lib/temporal/alert-delivery-activities";
import { patched, proxyActivities, uuid4 } from "@temporalio/workflow";

type LifecycleActivities = {
  claimAlertDeliveryActivity: typeof claimActivity;
  finalizeAlertDeliveryActivity: typeof finalizeActivity;
  loadAlertDeliveryContextActivity: typeof loadActivity;
  reserveAlertDeliveryBudgetActivity: typeof reserveBudgetActivity;
};

const lifecycle = proxyActivities<LifecycleActivities>({
  retry: { initialInterval: "5 seconds", maximumAttempts: 3 },
  startToCloseTimeout: "30 seconds",
});
const { sweepAlertDeliveriesActivity } = proxyActivities<{
  sweepAlertDeliveriesActivity: typeof sweepActivity;
}>({
  retry: { initialInterval: "5 seconds", maximumAttempts: 3 },
  startToCloseTimeout: "5 minutes",
});
const channelRetry = {
  backoffCoefficient: 2,
  initialInterval: "10 seconds",
  maximumAttempts: 5,
  maximumInterval: "10 minutes",
};
const { deliverAlertEmailActivity, deliverAlertWebhookActivity } = proxyActivities<{
  deliverAlertEmailActivity: typeof emailActivity;
  deliverAlertWebhookActivity: typeof webhookActivity;
}>({ retry: channelRetry, startToCloseTimeout: "1 minute" });
const { deliverAlertSlackActivity } = proxyActivities<{
  deliverAlertSlackActivity: typeof slackActivity;
}>({
  retry: { ...channelRetry, maximumAttempts: 3 },
  startToCloseTimeout: "1 minute",
});
// Push retries less: a late notification is worth less than an on-time one.
const { deliverAlertPushActivity } = proxyActivities<{
  deliverAlertPushActivity: typeof pushActivity;
}>({ retry: { ...channelRetry, maximumAttempts: 3 }, startToCloseTimeout: "1 minute" });
const digestChannels = proxyActivities<{
  deliverAlertDigestEmailActivity: typeof digestEmailActivity;
  deliverAlertDigestPushActivity: typeof digestPushActivity;
  deliverAlertDigestSlackActivity: typeof digestSlackActivity;
  deliverAlertDigestWebhookActivity: typeof digestWebhookActivity;
}>({ retry: channelRetry, startToCloseTimeout: "1 minute" });
const { finalizeAlertDigestDeliveryActivity } = proxyActivities<{
  finalizeAlertDigestDeliveryActivity: typeof finalizeDigestActivity;
}>({
  retry: { initialInterval: "5 seconds", maximumAttempts: 3 },
  startToCloseTimeout: "30 seconds",
});
const { prepareAlertDigestDeliveryActivity } = proxyActivities<{
  prepareAlertDigestDeliveryActivity: typeof prepareDigestActivity;
}>({
  retry: { initialInterval: "5 seconds", maximumAttempts: 3 },
  startToCloseTimeout: "30 seconds",
});

function reason(error: unknown) {
  const cause = (error as { cause?: unknown })?.cause;
  if (cause instanceof Error) return cause.message;
  return error instanceof Error ? error.message : "Alert delivery failed.";
}

async function deliverEmail(context: AlertDeliveryContext, outcomes: AlertDeliveryOutcome[]) {
  if (!context.channels.includes("email")) return;
  if (context.recipients.length === 0) {
    outcomes.push({
      channel: "email",
      delivered: false,
      reason: "Email delivery has no enabled recipients.",
      recordAttempt: true,
      ...(context.emailRecipientsConfigured ? { skipped: true } : {}),
    });
    return;
  }
  for (const recipient of context.recipients) {
    try {
      const result = await deliverAlertEmailActivity({
        alertId: context.triggeredAlertId,
        payload: context.payload,
        recipientEmail: recipient.email,
        // Prepared bytes stay in the activity, so this patch only adds recipient ids.
        ...(patched("alert-email-send-gate-v1")
          ? {
              projectInternalId: context.projectInternalId,
              ruleId: context.ruleInternalId,
              recipientUserId: recipient.userId,
            }
          : {}),
      });
      outcomes.push(
        result ? { channel: "email", ...result } : { channel: "email", delivered: true },
      );
    } catch (error) {
      outcomes.push({ channel: "email", delivered: false, reason: reason(error) });
    }
  }
}

async function deliverWebhooks(context: AlertDeliveryContext, outcomes: AlertDeliveryOutcome[]) {
  if (!context.channels.includes("webhook")) return;
  if (context.webhookEndpointIds.length === 0) {
    outcomes.push({
      channel: "webhook",
      delivered: false,
      reason: "No webhook endpoints.",
      recordAttempt: true,
    });
  }
  for (const endpointId of context.webhookEndpointIds) {
    try {
      const result = await deliverAlertWebhookActivity({
        alertId: context.triggeredAlertId,
        endpointId,
        payload: context.payload,
      });
      outcomes.push(
        result ? { channel: "webhook", ...result } : { channel: "webhook", delivered: true },
      );
    } catch (error) {
      outcomes.push({ channel: "webhook", delivered: false, reason: reason(error) });
    }
  }
}

async function deliverSlack(context: AlertDeliveryContext, outcomes: AlertDeliveryOutcome[]) {
  if (!context.channels.includes("slack")) return;
  if (!context.slackConnectionId) {
    outcomes.push({
      channel: "slack",
      delivered: false,
      recordAttempt: true,
      reason: "Slack delivery is not configured.",
    });
    return;
  }
  try {
    const result = await deliverAlertSlackActivity({
      alertId: context.triggeredAlertId,
      payload: context.payload,
      slackConnectionId: context.slackConnectionId,
    });
    outcomes.push(result ? { channel: "slack", ...result } : { channel: "slack", delivered: true });
  } catch (error) {
    outcomes.push({ channel: "slack", delivered: false, reason: reason(error) });
  }
}

async function deliverPush(context: AlertDeliveryContext, outcomes: AlertDeliveryOutcome[]) {
  if (!context.channels.includes("push") || !context.push) return;
  try {
    const result = await deliverAlertPushActivity({
      alertId: context.triggeredAlertId,
      message: context.push,
      projectInternalId: context.projectInternalId,
    });
    outcomes.push({ channel: "push", ...result });
  } catch (error) {
    outcomes.push({ channel: "push", delivered: false, reason: reason(error) });
  }
}

export async function alertDeliveryWorkflow(input: { alertId: string }) {
  const ownedInput = { ...input, deliveryClaimToken: uuid4() };
  const claim = await lifecycle.claimAlertDeliveryActivity(ownedInput);
  if (!claim.claimed) return { alertId: input.alertId, status: "skipped" as const };
  const context = await lifecycle.loadAlertDeliveryContextActivity(ownedInput);
  if (!context) return { alertId: input.alertId, status: "missing" as const };
  const budget = await lifecycle.reserveAlertDeliveryBudgetActivity(ownedInput);
  if (!budget.granted) return { alertId: input.alertId, status: "suppressed" as const };

  const outcomes: AlertDeliveryOutcome[] = [];
  await deliverEmail(context, outcomes);
  await deliverWebhooks(context, outcomes);
  await deliverSlack(context, outcomes);
  await deliverPush(context, outcomes);
  const finalized = await lifecycle.finalizeAlertDeliveryActivity({
    alertId: input.alertId,
    deliveryClaimToken: ownedInput.deliveryClaimToken,
    outcomes,
    payload: context.payload,
    projectInternalId: context.projectInternalId,
  });
  return { alertId: input.alertId, outcomes, status: finalized.deliveryState };
}

export async function alertDigestDeliveryWorkflow(input: AlertDigestJob) {
  // Prepare re-checks every alert and rebuilds the email, Slack and webhook content for the
  // deliverable subset once, before the first send attempt. Channel retries reuse this job and
  // never rebuild it; AL4 will freeze the prepared message per logical delivery.
  const job = await prepareAlertDigestDeliveryActivity(input);
  if (!job) return { alertIds: input.alertIds, outcomes: [], status: "skipped" as const };
  const outcomes: AlertDigestDeliveryOutcome[] = [];
  if (job.channels.includes("email")) {
    if (job.recipients.length === 0) {
      outcomes.push({
        channel: "email",
        delivered: false,
        reason: "Email delivery has no enabled recipients.",
        ...(job.emailRecipientsConfigured ? { skipped: true } : {}),
      });
    }
    for (const recipient of job.recipients) {
      try {
        const result = await digestChannels.deliverAlertDigestEmailActivity({ job, recipient });
        outcomes.push(
          typeof result === "boolean"
            ? { channel: "email", delivered: result, skipped: !result }
            : { channel: "email", ...result },
        );
      } catch (error) {
        outcomes.push({ channel: "email", delivered: false, reason: reason(error) });
      }
    }
  }
  if (job.channels.includes("webhook")) {
    if (job.webhookEndpointIds.length === 0) {
      outcomes.push({ channel: "webhook", delivered: false, skipped: true });
    }
    for (const endpointId of job.webhookEndpointIds) {
      try {
        const result = await digestChannels.deliverAlertDigestWebhookActivity({ endpointId, job });
        outcomes.push({
          channel: "webhook",
          ...(typeof result === "boolean" ? { delivered: result, skipped: !result } : result),
          webhookEndpointId: endpointId,
        });
      } catch (error) {
        outcomes.push({
          channel: "webhook",
          delivered: false,
          reason: reason(error),
          webhookEndpointId: endpointId,
        });
      }
    }
  }
  if (job.channels.includes("slack")) {
    try {
      const result = await digestChannels.deliverAlertDigestSlackActivity(job);
      outcomes.push({
        channel: "slack",
        ...(typeof result === "boolean" ? { delivered: result, skipped: !result } : result),
      });
    } catch (error) {
      outcomes.push({ channel: "slack", delivered: false, reason: reason(error) });
    }
  }
  if (job.channels.includes("push")) {
    try {
      const result = await digestChannels.deliverAlertDigestPushActivity(job);
      outcomes.push({
        channel: "push",
        ...(typeof result === "boolean" ? { delivered: result, skipped: !result } : result),
      });
    } catch (error) {
      outcomes.push({ channel: "push", delivered: false, reason: reason(error) });
    }
  }
  const finalized = await finalizeAlertDigestDeliveryActivity({ job, outcomes });
  return { alertIds: job.alertIds, outcomes, status: finalized.deliveryState };
}

export async function sweepAlertDeliveriesWorkflow() {
  return sweepAlertDeliveriesActivity();
}
