import { isPublicIdOfType, type PublicIdPrefix } from "@/lib/db/public-id";
import type { Prisma } from "@/lib/generated/prisma/client";
import { trackedProjectDomain } from "@/lib/schemas/project";
import type { TriggeredAlertDeliveryPayload } from "./delivery";

export const pendingAlertInclude = {
  keyword: { select: { publicId: true, text: true } },
  rule: {
    include: {
      createdBy: { select: { email: true, id: true } },
      project: {
        select: {
          domain: true,
          id: true,
          publicId: true,
          name: true,
          slackConnection: { select: { enabled: true, id: true } },
          webhookEndpoints: {
            select: { enabled: true, hmacSecret: true, id: true, url: true },
          },
        },
      },
      recipients: { select: { user: { select: { email: true, id: true } } } },
    },
  },
} satisfies Prisma.TriggeredAlertInclude;

export type PendingAlertDigestRecord = Prisma.TriggeredAlertGetPayload<{
  include: typeof pendingAlertInclude;
}>;

function payloadRecord(value: Prisma.JsonValue | null) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function requireDigestPublicId(value: string | null, prefix: PublicIdPrefix) {
  if (!value || !isPublicIdOfType(value, prefix)) {
    throw new Error(`Alert digest requires a v3 ${prefix} public ID.`);
  }
  return value;
}

export function deliveryPayload(alert: PendingAlertDigestRecord): TriggeredAlertDeliveryPayload {
  const stored = payloadRecord(alert.payload);
  return {
    action: String(stored.action ?? "Review the alert in bisibility."),
    afterPosition: alert.afterPosition,
    alertId: requireDigestPublicId(alert.publicId, "al"),
    beforePosition: alert.beforePosition,
    conditionType: alert.rule.conditionType,
    firedAt: alert.firedAt.toISOString(),
    headline: String(stored.headline ?? alert.rule.name),
    keyword: alert.keyword.text,
    keywordId: requireDigestPublicId(alert.keyword.publicId, "kw"),
    projectDomain: trackedProjectDomain(alert.rule.project.domain) ?? "",
    projectId: requireDigestPublicId(alert.rule.project.publicId, "prj"),
    ruleId: requireDigestPublicId(alert.rule.publicId, "alr"),
    ruleName: alert.rule.name,
  };
}
