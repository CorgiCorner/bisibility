import "server-only";

import { trackedProjectDomain } from "@/lib/schemas/project";
import { recordSuppressed, reserveDeliveryBudgetOnce } from "../alerts/daily-cap";
import type { AlertDeliveryChannel, AlertExternalDeliveryPayload } from "../alerts/delivery";
import { sendAlertOverflowNotice } from "../alerts/overflow-notice";
import {
  type AlertEmailRecipient,
  filterAlertEmailRecipients,
  resolveAlertRuleRecipients,
} from "../alerts/recipients";
import { deliverableAlertWhere } from "../alerts/transitions";
import { prisma } from "../db/prisma";
import { isPublicIdOfType } from "../db/public-id";
import { startAlertDeliveryWorkflow } from "./alert-delivery-client";

export type AlertDeliveryContext = {
  channels: AlertDeliveryChannel[];
  payload: AlertExternalDeliveryPayload;
  projectInternalId: string;
  recipients: AlertEmailRecipient[];
  slackConnectionId: string | null;
  triggeredAlertId: string;
  webhookEndpointIds: string[];
};

type OwnedAlertInput = { alertId: string; deliveryClaimToken: string };

function requireDeliveryPublicId(value: string | null, prefix: "al" | "alr" | "kw" | "prj") {
  if (!value || !isPublicIdOfType(value, prefix)) {
    throw new Error(`Alert delivery requires a v3 ${prefix} public ID.`);
  }
  return value;
}

export async function claimAlertDeliveryActivity(input: OwnedAlertInput) {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - 60 * 60_000);
  const result = await prisma.triggeredAlert.updateMany({
    data: {
      deliveryClaimedAt: now,
      deliveryClaimToken: input.deliveryClaimToken,
      deliveryState: "delivering",
    },
    where: {
      AND: [
        {
          OR: [
            { deliveryState: "pending" },
            { deliveryClaimToken: input.deliveryClaimToken, deliveryState: "delivering" },
            { deliveryClaimedAt: { lt: staleBefore }, deliveryState: "delivering" },
          ],
        },
        deliverableAlertWhere(now),
      ],
      id: input.alertId,
    },
  });
  if (result.count === 0) {
    await prisma.triggeredAlert.updateMany({
      data: {
        deliveryClaimedAt: null,
        deliveryClaimToken: null,
        deliveryState: "skipped",
      },
      where: {
        AND: [
          {
            OR: [
              { deliveryState: "pending" },
              { deliveryClaimToken: input.deliveryClaimToken, deliveryState: "delivering" },
            ],
          },
          { NOT: deliverableAlertWhere(now) },
        ],
        id: input.alertId,
      },
    });
  }
  return { claimed: result.count === 1 };
}

function payloadStrings(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { action: "", headline: "" };
  }
  const record = value as Record<string, unknown>;
  return {
    action: typeof record.action === "string" ? record.action : "",
    headline: typeof record.headline === "string" ? record.headline : "",
  };
}

export async function loadAlertDeliveryContextActivity(
  input: OwnedAlertInput,
): Promise<AlertDeliveryContext | null> {
  const alert = await prisma.triggeredAlert.findFirst({
    select: {
      afterPosition: true,
      beforePosition: true,
      firedAt: true,
      id: true,
      publicId: true,
      keyword: {
        select: {
          project: {
            select: {
              domain: true,
              id: true,
              publicId: true,
              slackConnection: { select: { enabled: true, id: true } },
              webhookEndpoints: { select: { id: true } },
            },
          },
          publicId: true,
          text: true,
        },
      },
      payload: true,
      rule: {
        select: {
          channels: true,
          conditionType: true,
          createdBy: {
            select: { email: true, id: true },
          },
          id: true,
          publicId: true,
          name: true,
          recipients: { select: { user: { select: { email: true, id: true } } } },
        },
      },
    },
    where: {
      deliveryClaimToken: input.deliveryClaimToken,
      deliveryState: "delivering",
      id: input.alertId,
      ...deliverableAlertWhere(new Date()),
    },
  });
  if (!alert) {
    await prisma.triggeredAlert.updateMany({
      data: {
        deliveryClaimedAt: null,
        deliveryClaimToken: null,
        deliveryState: "skipped",
      },
      where: {
        deliveryClaimToken: input.deliveryClaimToken,
        deliveryState: "delivering",
        id: input.alertId,
        NOT: deliverableAlertWhere(new Date()),
      },
    });
    return null;
  }

  const project = alert.keyword.project;
  const presentation = payloadStrings(alert.payload);
  const recipients = await filterAlertEmailRecipients(
    project.id,
    resolveAlertRuleRecipients(alert.rule),
  );
  return {
    channels: alert.rule.channels,
    payload: {
      ...presentation,
      afterPosition: alert.afterPosition,
      alertId: requireDeliveryPublicId(alert.publicId, "al"),
      beforePosition: alert.beforePosition,
      conditionType: alert.rule.conditionType,
      firedAt: alert.firedAt.toISOString(),
      keyword: alert.keyword.text,
      keywordId: requireDeliveryPublicId(alert.keyword.publicId, "kw"),
      projectDomain: trackedProjectDomain(project.domain) ?? "",
      projectId: requireDeliveryPublicId(project.publicId, "prj"),
      ruleId: requireDeliveryPublicId(alert.rule.publicId, "alr"),
      ruleName: alert.rule.name,
    },
    projectInternalId: project.id,
    recipients,
    slackConnectionId: project.slackConnection?.enabled ? project.slackConnection.id : null,
    triggeredAlertId: alert.id,
    webhookEndpointIds: project.webhookEndpoints.map(({ id }) => id),
  };
}

export async function reserveAlertDeliveryBudgetActivity(input: OwnedAlertInput) {
  const alert = await prisma.triggeredAlert.findFirst({
    select: {
      keyword: {
        select: {
          project: {
            select: {
              id: true,
              publicId: true,
              slackConnection: { select: { enabled: true, id: true } },
              webhookEndpoints: {
                select: { hmacSecret: true, id: true, url: true },
              },
            },
          },
        },
      },
      rule: {
        select: {
          channels: true,
          id: true,
          publicId: true,
          name: true,
        },
      },
    },
    where: {
      deliveryClaimToken: input.deliveryClaimToken,
      deliveryState: "delivering",
      id: input.alertId,
    },
  });
  if (!alert) return { granted: false };

  const now = new Date();
  const budget = await reserveDeliveryBudgetOnce({
    alertId: input.alertId,
    deliveryClaimToken: input.deliveryClaimToken,
    deliveryState: "delivering",
    now,
    ruleId: alert.rule.id,
  });
  if (budget.granted) return { granted: true };

  const suppression = await prisma.triggeredAlert.updateMany({
    data: {
      deliveryClaimedAt: null,
      deliveryClaimToken: null,
      deliveryState: "suppressed",
    },
    where: {
      deliveryClaimToken: input.deliveryClaimToken,
      deliveryState: "delivering",
      id: input.alertId,
    },
  });
  if (suppression.count === 0) return { granted: false };
  const suppressed = await recordSuppressed(alert.rule.id, now, 1);
  if (suppressed.overflowNoticeDue) {
    await sendAlertOverflowNotice({
      channels: alert.rule.channels,
      projectId: alert.keyword.project.id,
      projectPublicId: requireDeliveryPublicId(alert.keyword.project.publicId, "prj"),
      ruleId: alert.rule.id,
      rulePublicId: requireDeliveryPublicId(alert.rule.publicId, "alr"),
      ruleName: alert.rule.name,
      slackConnection: alert.keyword.project.slackConnection,
      suppressedCount: 1,
      webhooks: alert.keyword.project.webhookEndpoints,
    });
  }
  return { granted: false };
}

export async function sweepAlertDeliveriesActivity(): Promise<{
  scanned: number;
  started: number;
}> {
  const now = Date.now();
  const staleCandidates = {
    OR: [
      { deliveryState: "pending" as const, firedAt: { lt: new Date(now - 2 * 60_000) } },
      {
        deliveryClaimedAt: { lt: new Date(now - 60 * 60_000) },
        deliveryState: "delivering" as const,
      },
    ],
  };
  await prisma.triggeredAlert.updateMany({
    data: {
      deliveryClaimedAt: null,
      deliveryClaimToken: null,
      deliveryState: "skipped",
    },
    where: { AND: [staleCandidates, { NOT: deliverableAlertWhere(new Date(now)) }] },
  });
  const alerts = await prisma.triggeredAlert.findMany({
    orderBy: { firedAt: "asc" },
    select: { id: true },
    take: 100,
    where: {
      AND: [staleCandidates, deliverableAlertWhere(new Date(now))],
    },
  });
  let started = 0;
  for (const { id } of alerts) {
    await startAlertDeliveryWorkflow(id)
      .then(() => {
        started += 1;
      })
      .catch(() => undefined);
  }
  return { scanned: alerts.length, started };
}
