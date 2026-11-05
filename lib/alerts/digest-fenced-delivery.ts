import "server-only";

import {
  parkLegacyDigestClaims,
  releaseUnsubmittedDigestClaim,
  renewDigestClaim,
} from "./digest-claims";
import {
  deliverAlertDigestSlackActivity,
  deliverAlertDigestWebhookActivity,
  finalizeAlertDigestDeliveryActivity,
  prepareAlertDigestDeliveryActivity,
} from "./digest-delivery";
import { deliverAlertDigestEmailActivity } from "./digest-email";
import { fencedDigestSend } from "./digest-send-fence";
import type { AlertDigestJob } from "./digest-types";

export async function prepareFencedAlertDigestActivity(job: AlertDigestJob) {
  if (!(await renewDigestClaim(job))) return null;
  try {
    await parkLegacyDigestClaims(job);
    return await prepareAlertDigestDeliveryActivity(job);
  } catch (error) {
    await releaseUnsubmittedDigestClaim(job.alertIds, job.deliveryClaimToken);
    throw error;
  }
}
export const finalizeFencedAlertDigestActivity = finalizeAlertDigestDeliveryActivity;

export function deliverFencedAlertDigestEmailActivity(
  input: Parameters<typeof deliverAlertDigestEmailActivity>[0],
) {
  return fencedDigestSend(input.job, "email", input.recipient.userId, () =>
    deliverAlertDigestEmailActivity(input),
  );
}

export function deliverFencedAlertDigestWebhookActivity(input: {
  endpointId: string;
  job: AlertDigestJob;
}) {
  return fencedDigestSend(input.job, "webhook", input.endpointId, () =>
    deliverAlertDigestWebhookActivity(input),
  );
}

export function deliverFencedAlertDigestSlackActivity(job: AlertDigestJob) {
  return fencedDigestSend(job, "slack", job.slackConnection?.id ?? "unconfigured", () =>
    deliverAlertDigestSlackActivity(job),
  );
}
