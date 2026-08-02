import "server-only";

import { prisma } from "@/lib/db/prisma";
import { isPublicIdOfType, type PublicIdPrefix } from "@/lib/db/public-id";
import type { Prisma } from "@/lib/generated/prisma/client";
import { enqueueAlertDigestJob } from "@/lib/temporal/alert-delivery-client";
import { recordSuppressed, reserveDeliveryBudgetOnce, utcDay } from "./daily-cap";
import type { TriggeredAlertDeliveryPayload } from "./delivery";
import { createDeliveryClaimToken, recoverStaleDigestClaims } from "./digest-claims";
import { renderAlertDigest } from "./digest-render";
import type { AlertDigestJob } from "./digest-types";
import { ALERT_DIGEST_JOB_MAX_ALERTS, PENDING_ALERT_FLUSH_BATCH_LIMIT } from "./limits";
import { sendAlertOverflowNotice } from "./overflow-notice";
import { filterAlertEmailRecipients, resolveAlertRuleRecipients } from "./recipients";
import { deliverableAlertWhere } from "./transitions";

const pendingAlertInclude = {
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

export type FlushAlertDigestsResult = {
  alertsQueued: number;
  alertsSuppressed: number;
  digestsQueued: number;
  groupsFailed: number;
};

export type FlushAlertDigestDependencies = {
  enqueueDigestJob: typeof enqueueAlertDigestJob;
  sendOverflowNotice: typeof sendAlertOverflowNotice;
};

export type FlushAlertDigestCheckpoint = (details: {
  groupIndex: number;
  ruleId: string;
}) => Promise<void> | void;

const defaultDependencies: FlushAlertDigestDependencies = {
  enqueueDigestJob: enqueueAlertDigestJob,
  sendOverflowNotice: sendAlertOverflowNotice,
};

function payloadRecord(value: Prisma.JsonValue | null) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function requireDigestPublicId(value: string | null, prefix: PublicIdPrefix) {
  if (!value || !isPublicIdOfType(value, prefix)) {
    throw new Error(`Alert digest requires a v3 ${prefix} public ID.`);
  }
  return value;
}

function deliveryPayload(alert: PendingAlertDigestRecord): TriggeredAlertDeliveryPayload {
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
    projectDomain: alert.rule.project.domain,
    projectId: requireDigestPublicId(alert.rule.project.publicId, "prj"),
    ruleId: requireDigestPublicId(alert.rule.publicId, "alr"),
    ruleName: alert.rule.name,
  };
}

type DigestBuildContext = {
  createdAt: Date;
  deliveryClaimToken: string;
  suppressedByRule: ReadonlyMap<string, number>;
};

// Group construction stays pure so Batch 4 can enqueue these jobs instead of delivering inline.
export function buildAlertDigestGroups(
  pendingAlerts: PendingAlertDigestRecord[],
  context: DigestBuildContext,
): AlertDigestJob[] {
  const groups = new Map<string, PendingAlertDigestRecord[]>();
  for (const alert of pendingAlerts) {
    const group = groups.get(alert.ruleId) ?? [];
    group.push(alert);
    groups.set(alert.ruleId, group);
  }

  return [...groups.values()].map((group) => {
    const first = group[0];
    if (!first) throw new Error("Alert digest group cannot be empty.");
    const alerts = group.map(deliveryPayload);
    const rendered = renderAlertDigest({
      alerts,
      conditionType: first.rule.conditionType,
      createdAt: context.createdAt,
      projectDomain: first.rule.project.domain,
      projectId: requireDigestPublicId(first.rule.project.publicId, "prj"),
      projectName: first.rule.project.name,
      ruleId: requireDigestPublicId(first.rule.publicId, "alr"),
      ruleName: first.rule.name,
      suppressedTodayCount: context.suppressedByRule.get(first.ruleId) ?? 0,
    });
    return {
      alertIds: group.map((alert) => alert.id),
      alerts,
      channels: first.rule.channels,
      conditionType: first.rule.conditionType,
      createdAt: context.createdAt.toISOString(),
      deliveryClaimToken: context.deliveryClaimToken,
      email: rendered.email,
      projectDomain: first.rule.project.domain,
      projectId: first.rule.project.id,
      projectName: first.rule.project.name,
      recipients: resolveAlertRuleRecipients(first.rule),
      ruleId: first.ruleId,
      ruleName: first.rule.name,
      slackConnection: first.rule.project.slackConnection,
      slackText: rendered.slackText,
      suppressedTodayCount: context.suppressedByRule.get(first.ruleId) ?? 0,
      webhookBody: rendered.webhookBody,
      webhookEndpointIds: first.rule.project.webhookEndpoints.map(({ id }) => id),
    };
  });
}

async function suppressedToday(ruleId: string, now: Date) {
  const stat = await prisma.alertRuleDailyStat.findUnique({
    select: { suppressedCount: true },
    where: { ruleId_day: { day: utcDay(now), ruleId } },
  });
  return stat?.suppressedCount ?? 0;
}

async function suppressGroup(
  group: PendingAlertDigestRecord[],
  deliveryClaimToken: string,
  now: Date,
  dependencies: FlushAlertDigestDependencies,
  notify: boolean,
) {
  const first = group[0];
  if (!first) return;
  const ids = group.map((alert) => alert.id);
  const suppression = await prisma.triggeredAlert.updateMany({
    data: {
      deliveryClaimedAt: null,
      deliveryClaimToken: null,
      deliveryState: "suppressed",
    },
    where: { deliveryClaimToken, deliveryState: "digesting", id: { in: ids } },
  });
  if (suppression.count === 0) return;
  const suppressed = await recordSuppressed(first.ruleId, now, group.length);
  if (notify && suppressed.overflowNoticeDue) {
    await dependencies.sendOverflowNotice({
      channels: first.rule.channels,
      projectId: first.rule.project.id,
      projectPublicId: requireDigestPublicId(first.rule.project.publicId, "prj"),
      ruleId: first.ruleId,
      rulePublicId: requireDigestPublicId(first.rule.publicId, "alr"),
      ruleName: first.rule.name,
      slackConnection: first.rule.project.slackConnection,
      suppressedCount: group.length,
      webhooks: first.rule.project.webhookEndpoints.filter((endpoint) => endpoint.enabled),
    });
  }
}

export async function flushAlertDigests(
  now = new Date(),
  dependencies: FlushAlertDigestDependencies = defaultDependencies,
  checkpoint?: FlushAlertDigestCheckpoint,
): Promise<FlushAlertDigestsResult> {
  const deliveryClaimToken = createDeliveryClaimToken();
  await recoverStaleDigestClaims(now);
  await prisma.triggeredAlert.updateMany({
    data: { deliveryState: "skipped" },
    where: { deliveryState: "digest_pending", NOT: deliverableAlertWhere(now) },
  });
  const pending = await prisma.triggeredAlert.findMany({
    include: pendingAlertInclude,
    orderBy: { firedAt: "asc" },
    take: PENDING_ALERT_FLUSH_BATCH_LIMIT,
    where: { deliveryState: "digest_pending", ...deliverableAlertWhere(now) },
  });
  const rawGroups = new Map<string, PendingAlertDigestRecord[]>();
  for (const alert of pending) {
    rawGroups.set(alert.ruleId, [...(rawGroups.get(alert.ruleId) ?? []), alert]);
  }

  const result: FlushAlertDigestsResult = {
    alertsQueued: 0,
    alertsSuppressed: 0,
    digestsQueued: 0,
    groupsFailed: 0,
  };
  let groupIndex = 0;
  for (const group of rawGroups.values()) {
    const first = group[0];
    if (!first) continue;
    groupIndex += 1;
    await checkpoint?.({ groupIndex, ruleId: first.ruleId });
    const digestGroup = group.slice(0, ALERT_DIGEST_JOB_MAX_ALERTS);
    const digestIds = digestGroup.map((alert) => alert.id);
    const digestFirst = digestGroup[0];
    if (!digestFirst) continue;
    const claimed = await prisma.triggeredAlert.updateMany({
      data: { deliveryClaimedAt: now, deliveryClaimToken, deliveryState: "digesting" },
      where: {
        deliveryState: "digest_pending",
        id: { in: digestIds },
        ...deliverableAlertWhere(now),
      },
    });
    if (claimed.count !== digestIds.length) {
      await prisma.triggeredAlert.updateMany({
        data: {
          deliveryClaimedAt: null,
          deliveryClaimToken: null,
          deliveryState: "digest_pending",
        },
        where: { deliveryClaimToken, deliveryState: "digesting", id: { in: digestIds } },
      });
      result.groupsFailed += 1;
      continue;
    }
    const budget = await reserveDeliveryBudgetOnce({
      alertId: digestFirst.id,
      deliveryClaimToken,
      deliveryState: "digesting",
      now,
      ruleId: first.ruleId,
    });
    if (!budget.granted) {
      await suppressGroup(digestGroup, deliveryClaimToken, now, dependencies, true);
      result.alertsSuppressed += digestGroup.length;
      continue;
    }
    const recipients = await filterAlertEmailRecipients(
      first.rule.project.id,
      resolveAlertRuleRecipients(first.rule),
    );
    const suppressedByRule = new Map([[first.ruleId, await suppressedToday(first.ruleId, now)]]);
    const job = buildAlertDigestGroups(digestGroup, {
      createdAt: now,
      deliveryClaimToken,
      suppressedByRule,
    })[0];
    if (!job) continue;
    job.recipients = recipients;
    try {
      await dependencies.enqueueDigestJob(job);
      result.digestsQueued += 1;
      result.alertsQueued += digestGroup.length;
    } catch {
      await prisma.triggeredAlert.updateMany({
        data: {
          deliveryClaimedAt: null,
          deliveryClaimToken: null,
          deliveryState: "digest_pending",
        },
        where: {
          deliveryClaimToken,
          deliveryState: "digesting",
          id: { in: job.alertIds },
        },
      });
      result.groupsFailed += 1;
    }
  }
  return result;
}
