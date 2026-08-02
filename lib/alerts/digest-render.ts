import { escapeHtml } from "@/lib/email/escape-html";
import { alertCountLabel } from "./count-label";
import type { TriggeredAlertDeliveryPayload } from "./delivery";
import { ALERT_DIGEST_MAX_ITEMS } from "./limits";
import { buildAlertDigestWebhookBody } from "./webhook-envelope";

type AlertDigestRenderInput = {
  alerts: TriggeredAlertDeliveryPayload[];
  conditionType: string;
  createdAt: Date;
  projectDomain: string;
  projectId: string;
  projectName: string;
  ruleId: string;
  ruleName: string;
  suppressedTodayCount: number;
};

function positionLabel(position: number | null) {
  return position ? `#${position}` : "No rank";
}

function visibleLines(alerts: TriggeredAlertDeliveryPayload[]) {
  const visible = alerts
    .slice(0, ALERT_DIGEST_MAX_ITEMS)
    .map(
      (alert) =>
        `${alert.keyword}: ${positionLabel(alert.beforePosition)} -> ${positionLabel(alert.afterPosition)}`,
    );
  const hidden = alerts.length - visible.length;
  return hidden > 0 ? [...visible, `+${hidden} more`] : visible;
}

export function renderAlertDigest(input: AlertDigestRenderInput) {
  const count = input.alerts.length;
  const subject = `[bisibility] ${alertCountLabel(count)} - ${input.ruleName} - ${input.projectName}`;
  const lines = visibleLines(input.alerts);
  const suppressionSummary =
    input.suppressedTodayCount > 0
      ? `${alertCountLabel(input.suppressedTodayCount)} suppressed after the daily delivery-batch cap; suppressed alerts remain visible in bisibility.`
      : null;
  const header = [
    subject,
    `Rule: ${input.ruleName}`,
    `Condition: ${input.conditionType}`,
    `Project: ${input.projectDomain}`,
  ];
  const text = [...header, ...(suppressionSummary ? [suppressionSummary] : []), "", ...lines].join(
    "\n",
  );
  const html = [
    `<h2>${escapeHtml(subject)}</h2>`,
    `<p><strong>Rule:</strong> ${escapeHtml(input.ruleName)}</p>`,
    `<p><strong>Condition:</strong> ${escapeHtml(input.conditionType)}</p>`,
    `<p><strong>Project:</strong> ${escapeHtml(input.projectDomain)}</p>`,
    suppressionSummary ? `<p>${escapeHtml(suppressionSummary)}</p>` : "",
    `<ul>${lines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>`,
  ].join("");

  return {
    email: { html, subject, text },
    slackText: text,
    webhookBody: buildAlertDigestWebhookBody(
      {
        alert_count: count,
        alerts: input.alerts,
        condition_type: input.conditionType,
        project_domain: input.projectDomain,
        project_id: input.projectId,
        rule_id: input.ruleId,
        rule_name: input.ruleName,
        suppressed_today_count: input.suppressedTodayCount,
      },
      input.createdAt.toISOString(),
    ),
  };
}
