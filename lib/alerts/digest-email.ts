import "server-only";

import { reserveEmailDailyBudget } from "@/lib/email/budget";
import { alertsEmailFrom } from "@/lib/email/from";
import { describeEmailTransport } from "@/lib/email/idempotency";
import {
  notificationUnsubscribeFooter,
  notificationUnsubscribeUrl,
} from "@/lib/email/notification-unsubscribe";
import { assertMailNotSuppressed } from "@/lib/email/provider-feedback-store";
import { resolveEmailProvider } from "@/lib/email/registry";
import { sendEmail } from "@/lib/email/send";
import { EmailSuppressedError } from "@/lib/email/types";
import { resolveCanonicalOrigin } from "@/lib/seo/origin";
import { classifyDeliveryFailure, deliveryFailureMessage } from "@/lib/temporal/delivery-failures";
import { legacyDigestAdmission } from "./digest-legacy-admission";
import type { AlertDigestJob } from "./digest-types";
import {
  deliverPreparedEmail,
  digestEmailCanonicalEncoding,
  digestEmailIdentity,
  EmailAttemptLogError,
  RecordedDeliveryError,
} from "./prepared-email-delivery";
import { prismaPreparedEmailStore } from "./prepared-email-store";
import type { AlertEmailRecipient } from "./recipients";
import {
  AlertDeliverySkipped,
  alertEmailSendGate,
  digestRefusal,
  requireAlertEmailSend,
} from "./send-gate";

function listHeaders(url: string) {
  return {
    "List-Unsubscribe": `<${url}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

export async function deliverAlertDigestEmailActivity(input: {
  job: AlertDigestJob;
  recipient: AlertEmailRecipient;
}) {
  try {
    const identityInput = {
      alertIds: input.job.alertIds,
      ruleId: input.job.ruleId,
      userId: input.recipient.userId,
    };
    const identity = digestEmailIdentity(identityInput);
    const identityInputs = digestEmailCanonicalEncoding(identityInput);
    const existing = await prismaPreparedEmailStore.find(identity);
    const admission = await legacyDigestAdmission(input.job);
    if (admission) {
      return existing?.state === "accepted"
        ? { delivered: true, skipped: false }
        : { ...admission, skipped: false };
    }

    const gate = await alertEmailSendGate({
      alertIds: input.job.alertIds,
      projectId: input.job.projectId,
      ruleId: input.job.ruleId,
      userId: input.recipient.userId,
    });
    if (!gate.allowed) return digestRefusal(gate.reason);
    const latest =
      existing && existing.state !== "prepared"
        ? null
        : await requireAlertEmailSend({
            alertIds: input.job.alertIds,
            projectId: input.job.projectId,
            ruleId: input.job.ruleId,
            userId: input.recipient.userId,
          });
    const provider = resolveEmailProvider();
    return await deliverPreparedEmail({
      checkSuppression: assertMailNotSuppressed,
      identity,
      identityInputs,
      record: async () => undefined,
      releaseUnconsumedBudgetClaim: (id) =>
        prismaPreparedEmailStore.releaseUnconsumedBudgetClaim(id),
      render: () => {
        const url = notificationUnsubscribeUrl(
          { projectId: input.job.projectId, stream: "alert", userId: input.recipient.userId },
          resolveCanonicalOrigin(),
        );
        const content = notificationUnsubscribeFooter(input.job.email, url);
        return {
          from: alertsEmailFrom(),
          headers: listHeaders(url),
          html: content.html,
          listUnsubscribeUrl: url,
          subject: input.job.email.subject,
          text: content.text,
          to: latest?.email ?? gate.email,
        };
      },
      reserveBudget: () => reserveEmailDailyBudget("bulk"),
      send: (message, claimProviderSend) =>
        sendEmail({
          beforeProviderSend: () =>
            requireAlertEmailSend({
              alertIds: input.job.alertIds,
              projectId: input.job.projectId,
              ruleId: input.job.ruleId,
              userId: input.recipient.userId,
            }).then(() => undefined),
          claimProviderSend,
          category: "bulk",
          dailyBudgetReserved: message.dailyBudgetReserved,
          from: message.from,
          headers: message.headers,
          html: message.html,
          idempotencyKey: message.idempotencyKey,
          listUnsubscribeUrl: message.listUnsubscribeUrl,
          subject: message.subject,
          text: message.text,
          to: message.to,
        }),
      store: prismaPreparedEmailStore,
      transport: describeEmailTransport(provider?.id ?? null),
    });
  } catch (error) {
    if (error instanceof AlertDeliverySkipped) return digestRefusal(error.message);
    if (error instanceof EmailSuppressedError) return digestRefusal(error.message);
    if (error instanceof EmailAttemptLogError) throw error;
    if (error instanceof RecordedDeliveryError) {
      throw classifyDeliveryFailure(error.cause, "email", deliveryFailureMessage(error.cause));
    }
    const errorMessage = deliveryFailureMessage(error, "Alert digest delivery failed.");
    throw classifyDeliveryFailure(error, "email", errorMessage);
  }
}
