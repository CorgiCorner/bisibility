import "server-only";
import { recordResultReceipt } from "@/lib/activity/result-receipt-extension";
import type { TriggeredAlertDeliveryPayload } from "@/lib/alerts/alert-delivery-payload";
import { recordDeliveryAttempt } from "@/lib/alerts/delivery";
import { reserveEmailDailyBudget } from "@/lib/email/budget";
import { escapeHtml } from "@/lib/email/escape-html";
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
import {
  alertEmailIdentity,
  deliverPreparedEmail,
  EmailAttemptLogError,
  RecordedDeliveryError,
} from "./prepared-email-delivery";
import { prismaPreparedEmailStore } from "./prepared-email-store";
import {
  AlertDeliverySkipped,
  alertEmailSendGate,
  requireAlertEmailSend,
  resolveAlertEmailIds,
} from "./send-gate";

function listHeaders(url: string) {
  return {
    "List-Unsubscribe": `<${url}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

function renderAlertEmail(
  to: string,
  scope: { projectId: string; userId: string },
  payload: TriggeredAlertDeliveryPayload,
) {
  const url = notificationUnsubscribeUrl(
    { projectId: scope.projectId, stream: "alert", userId: scope.userId },
    resolveCanonicalOrigin(),
  );
  const content = notificationUnsubscribeFooter(
    {
      html: `<p><strong>${escapeHtml(payload.headline)}</strong></p><p>${escapeHtml(payload.action)}</p>`,
      text: `${payload.headline}\n\n${payload.action}`,
    },
    url,
  );
  return {
    from: alertsEmailFrom(),
    headers: listHeaders(url),
    html: content.html,
    listUnsubscribeUrl: url,
    subject: `[bisibility] ${payload.headline}`,
    text: content.text,
    to,
  };
}

export async function deliverAlertEmailActivity(input: {
  alertId: string;
  payload: TriggeredAlertDeliveryPayload;
  recipientEmail: string;
  recipientUserId?: string;
  projectInternalId?: string;
  ruleId?: string;
}) {
  try {
    const ids = await resolveAlertEmailIds(input);
    const gate = await alertEmailSendGate({ alertIds: [input.alertId], ...ids });
    if (!gate.allowed) {
      await recordDeliveryAttempt(input.alertId, "email", "skipped", gate.reason);
      return { delivered: false, skipped: true, reason: gate.reason };
    }
    const identity = alertEmailIdentity(input.alertId, gate.userId);
    const existing = await prismaPreparedEmailStore.find(identity);
    const latest =
      existing && existing.state !== "prepared"
        ? null
        : await requireAlertEmailSend({
            alertIds: [input.alertId],
            projectId: gate.projectId,
            ruleId: ids.ruleId,
            userId: gate.userId,
          });
    if (existing?.state === "prepared" && latest && latest.email !== existing.to) {
      await prismaPreparedEmailStore.compareAndSet(identity, "prepared", { to: latest.email });
    }
    const provider = resolveEmailProvider();
    const result = await deliverPreparedEmail({
      checkSuppression: assertMailNotSuppressed,
      identity,
      record: (status, error) => recordDeliveryAttempt(input.alertId, "email", status, error),
      releaseUnconsumedBudgetClaim: (id) =>
        prismaPreparedEmailStore.releaseUnconsumedBudgetClaim(id),
      render: () => renderAlertEmail(latest?.email ?? gate.email, gate, input.payload),
      reserveBudget: () => reserveEmailDailyBudget("bulk"),
      send: (message, claimProviderSend) =>
        sendEmail({
          beforeProviderSend: () =>
            requireAlertEmailSend({
              alertIds: [input.alertId],
              projectId: gate.projectId,
              ruleId: ids.ruleId,
              userId: gate.userId,
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
    recordResultReceipt({
      userId: gate.userId,
      surface: "alert",
      nonEmpty:
        result.delivered &&
        existing?.state !== "accepted" &&
        input.payload.test !== true &&
        (input.payload.afterPosition !== null || input.payload.beforePosition !== null),
    });
    return result;
  } catch (error) {
    if (error instanceof AlertDeliverySkipped || error instanceof EmailSuppressedError) {
      await recordDeliveryAttempt(input.alertId, "email", "skipped", error.message);
      return { delivered: false, skipped: true, reason: error.message };
    }
    if (error instanceof EmailAttemptLogError) throw error;
    if (error instanceof RecordedDeliveryError) {
      throw classifyDeliveryFailure(error.cause, "email");
    }
    const errorMessage = deliveryFailureMessage(error);
    await recordDeliveryAttempt(input.alertId, "email", "failed", errorMessage);
    throw classifyDeliveryFailure(error, "email", errorMessage);
  }
}
