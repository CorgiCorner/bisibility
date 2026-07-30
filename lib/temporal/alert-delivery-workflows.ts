import { proxyActivities, uuid4 } from "@temporalio/workflow";
import type { AlertDigestJob } from "../alerts/digest-types";
import type {
  AlertDeliveryContext,
  AlertDeliveryOutcome,
  AlertDigestDeliveryOutcome,
  claimAlertDeliveryActivity as claimActivity,
  deliverAlertDigestEmailActivity as digestEmailActivity,
  deliverAlertDigestSlackActivity as digestSlackActivity,
  deliverAlertDigestWebhookActivity as digestWebhookActivity,
  deliverAlertEmailActivity as emailActivity,
  finalizeAlertDeliveryActivity as finalizeActivity,
  finalizeAlertDigestDeliveryActivity as finalizeDigestActivity,
  loadAlertDeliveryContextActivity as loadActivity,
  prepareAlertDigestDeliveryActivity as prepareDigestActivity,
  reserveAlertDeliveryBudgetActivity as reserveBudgetActivity,
  deliverAlertSlackActivity as slackActivity,
  sweepAlertDeliveriesActivity as sweepActivity,
  deliverAlertWebhookActivity as webhookActivity,
} from "./alert-delivery-activities";

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
const digestChannels = proxyActivities<{
  deliverAlertDigestEmailActivity: typeof digestEmailActivity;
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
    });
    return;
  }
  for (const recipient of context.recipients) {
    try {
      await deliverAlertEmailActivity({
        alertId: context.triggeredAlertId,
        payload: context.payload,
        recipientEmail: recipient.email,
      });
      outcomes.push({ channel: "email", delivered: true });
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
      await deliverAlertWebhookActivity({
        alertId: context.triggeredAlertId,
        endpointId,
        payload: context.payload,
      });
      outcomes.push({ channel: "webhook", delivered: true });
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
    await deliverAlertSlackActivity({
      alertId: context.triggeredAlertId,
      payload: context.payload,
      slackConnectionId: context.slackConnectionId,
    });
    outcomes.push({ channel: "slack", delivered: true });
  } catch (error) {
    outcomes.push({ channel: "slack", delivered: false, reason: reason(error) });
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
  const job = await prepareAlertDigestDeliveryActivity(input);
  if (!job) return { alertIds: input.alertIds, outcomes: [], status: "skipped" as const };
  const outcomes: AlertDigestDeliveryOutcome[] = [];
  if (job.channels.includes("email")) {
    if (job.recipients.length === 0) {
      outcomes.push({
        channel: "email",
        delivered: false,
        reason: "Email delivery has no enabled recipients.",
      });
    }
    for (const recipient of job.recipients) {
      try {
        const delivered = await digestChannels.deliverAlertDigestEmailActivity({ job, recipient });
        outcomes.push({ channel: "email", delivered, skipped: !delivered });
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
        const delivered = await digestChannels.deliverAlertDigestWebhookActivity({
          endpointId,
          job,
        });
        outcomes.push({
          channel: "webhook",
          delivered,
          skipped: !delivered,
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
      const delivered = await digestChannels.deliverAlertDigestSlackActivity(job);
      outcomes.push({ channel: "slack", delivered, skipped: !delivered });
    } catch (error) {
      outcomes.push({ channel: "slack", delivered: false, reason: reason(error) });
    }
  }
  const finalized = await finalizeAlertDigestDeliveryActivity({ job, outcomes });
  return { alertIds: job.alertIds, outcomes, status: finalized.deliveryState };
}

export async function sweepAlertDeliveriesWorkflow() {
  return sweepAlertDeliveriesActivity();
}
