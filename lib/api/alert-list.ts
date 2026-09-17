import "server-only";
import type {
  AlertRuleView,
  TriggeredAlertFeedView,
  TriggeredAlertView,
} from "@/lib/alerts/alert-data";
import { getRequestAlertKeywordData } from "@/lib/alerts/alert-request-data";
import { visibleAlertSnoozeWhere } from "@/lib/alerts/snooze";
import {
  legacyPositionText,
  legacyRelativeTime,
  legacyWebhookEndpointLabel,
  payloadString,
  payloadStrings,
} from "@/lib/api/alert-payload-values";
import { prisma } from "@/lib/db/prisma";
import { type PublicIdPrefix, parsePublicId } from "@/lib/db/public-id";
import type { Prisma } from "@/lib/generated/prisma/client";

export type AlertFeedQuery = {
  marketsByLocation?: ReadonlyMap<string, { id: string; label: string; language: string }>;
  where?: readonly Prisma.TriggeredAlertWhereInput[];
};

function requiredPublicId(value: string | null, resource: string, prefix: PublicIdPrefix) {
  if (!value || parsePublicId(value)?.prefix !== prefix) {
    throw new Error(`${resource} public ID is not available.`);
  }
  return value;
}
function scopeValues(
  rule: {
    targetType: string;
    targets: {
      keywordId: string | null;
      tag?: { name: string } | null;
    }[];
  },
  keywordLabels: ReadonlyMap<string, string>,
) {
  return rule.targets
    .map((target) => (target.keywordId ? keywordLabels.get(target.keywordId) : target.tag?.name))
    .filter((name): name is string => Boolean(name));
}
function ruleView(
  rule: Awaited<ReturnType<typeof loadRules>>[number],
  keywordLabels: ReadonlyMap<string, string>,
): AlertRuleView {
  return {
    changePct: rule.changePct === null ? null : Number(rule.changePct),
    channels: rule.channels,
    conditionType: rule.conditionType,
    competitorDomain: rule.competitorDomain,
    dropPositions: rule.dropPositions,
    enabled: rule.enabled,
    firedThisWeek: rule.triggered.length,
    id: requiredPublicId(rule.publicId, "Alert rule", "alr"),
    marketIds: rule.markets.map(({ projectMarket }) =>
      requiredPublicId(projectMarket.publicId, "Project market", "pmkt"),
    ),
    name: rule.name,
    period: rule.conditionType === "ctr_drop" ? "ctr_baseline" : "each_check",
    recipientIds: rule.recipients.map(({ user }) =>
      requiredPublicId(user.publicId, "Recipient", "usr"),
    ),
    scope: { labels: scopeValues(rule, keywordLabels), targetType: rule.targetType },
    serpFeature: rule.serpFeature,
    severity: rule.severity,
    status: rule.enabled ? "active" : "paused",
    targetIds: rule.targets.flatMap((target) =>
      target.keyword?.publicId
        ? [requiredPublicId(target.keyword.publicId, "Keyword", "kw")]
        : target.tag?.publicId
          ? [requiredPublicId(target.tag.publicId, "Tag", "tag")]
          : [],
    ),
    targetType: rule.targetType,
    thresholdPosition: rule.thresholdPosition,
    topN: rule.topN,
  };
}
function alertView(
  alert: Awaited<ReturnType<typeof loadAlerts>>[number],
  keywordLabels: ReadonlyMap<string, string>,
  marketsByLocation: AlertFeedQuery["marketsByLocation"],
): TriggeredAlertView {
  const payload = alert.payload;
  const severity = payloadString(payload, "severity") ?? alert.rule.severity;
  const market = marketsByLocation?.get(alert.keyword.locationId);
  const visibleSeverity = severity === "info" || severity === "urgent" ? severity : "warning";
  return {
    action: payloadString(payload, "action") ?? "Review the latest rank check.",
    ctas: payloadStrings(payload, "ctas") ?? ["Open keyword"],
    current: payloadString(payload, "current") ?? legacyPositionText(alert.afterPosition),
    deliveryAttempts: alert.deliveryAttempts.map((attempt) => ({
      channel: attempt.channel,
      error: attempt.error,
      status: attempt.status,
      webhookEndpointId: attempt.webhookEndpoint
        ? requiredPublicId(attempt.webhookEndpoint.publicId, "Webhook endpoint", "we")
        : null,
      webhookEndpointLabel: legacyWebhookEndpointLabel(attempt.channel, attempt.webhookEndpoint),
      when: legacyRelativeTime(attempt.attemptedAt),
    })),
    deliveryState: alert.deliveryState,
    feedMeta: {
      engine: "Google",
      ...(alert.keyword.locationRef.languageLabel
        ? { language: alert.keyword.locationRef.languageLabel }
        : {}),
      ...(market ? { market: { id: market.id, label: market.label } } : {}),
      module: "rank",
      severity: visibleSeverity,
      source: "RANK",
    },
    headline: payloadString(payload, "headline") ?? alert.rule.name,
    id: requiredPublicId(alert.publicId, "Triggered alert", "al"),
    keyword: keywordLabels.get(alert.keywordId) ?? "Unknown keyword",
    location: alert.keyword.locationRef.displayName,
    device: alert.keyword.device,
    previous: payloadString(payload, "previous") ?? legacyPositionText(alert.beforePosition),
    rankingUrl: payloadString(payload, "rankingUrl"),
    rule: alert.rule.name,
    severity: visibleSeverity,
    targetUrl: payloadString(payload, "targetUrl"),
    unread: alert.status === "firing",
    when: legacyRelativeTime(alert.firedAt),
  };
}

function alertFeedView(
  alert: Awaited<ReturnType<typeof loadAlerts>>[number],
  keywordLabels: ReadonlyMap<string, string>,
  marketsByLocation: AlertFeedQuery["marketsByLocation"],
): TriggeredAlertFeedView {
  const market = marketsByLocation?.get(alert.keyword.locationId);
  const storedSeverity = payloadString(alert.payload, "severity") ?? alert.rule.severity;
  const visibleSeverity =
    storedSeverity === "info" || storedSeverity === "urgent" ? storedSeverity : "warning";

  return {
    afterPosition: alert.afterPosition,
    beforePosition: alert.beforePosition,
    condition: {
      changePct: alert.rule.changePct === null ? null : Number(alert.rule.changePct),
      competitorDomain: alert.rule.competitorDomain,
      dropPositions: alert.rule.dropPositions,
      serpFeature: alert.rule.serpFeature,
      thresholdPosition: alert.rule.thresholdPosition,
      topN: alert.rule.topN,
    },
    conditionType: alert.rule.conditionType,
    deliveryAttempts: alert.deliveryAttempts.map((attempt) => ({
      attemptedAt: attempt.attemptedAt.toISOString(),
      channel: attempt.channel,
      error: attempt.error,
      status: attempt.status,
      webhookEndpoint: attempt.webhookEndpoint
        ? {
            id: requiredPublicId(attempt.webhookEndpoint.publicId, "Webhook endpoint", "we"),
            label: attempt.webhookEndpoint.description?.trim() || attempt.webhookEndpoint.url,
          }
        : null,
    })),
    deliveryState: alert.deliveryState,
    device: alert.keyword.device,
    feedMeta: {
      engine: "Google",
      ...(alert.keyword.locationRef.languageLabel
        ? { language: alert.keyword.locationRef.languageLabel }
        : {}),
      ...(market ? { market: { id: market.id, label: market.label } } : {}),
      module: "rank",
      severity: visibleSeverity,
      source: "RANK",
    },
    firedAt: alert.firedAt.toISOString(),
    id: requiredPublicId(alert.publicId, "Triggered alert", "al"),
    keyword: keywordLabels.get(alert.keywordId) ?? null,
    rankingUrl: payloadString(alert.payload, "rankingUrl"),
    rule: alert.rule.name,
    severity: visibleSeverity,
    targetUrl: payloadString(alert.payload, "targetUrl"),
    unread: alert.status === "firing",
  };
}
async function loadRules(projectId: string) {
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  return prisma.alertRule.findMany({
    include: {
      markets: { include: { projectMarket: { select: { publicId: true } } } },
      recipients: { select: { user: { select: { publicId: true } } } },
      targets: {
        include: {
          keyword: { select: { publicId: true } },
          tag: { select: { name: true, publicId: true } },
        },
      },
      triggered: {
        select: { id: true },
        where: { firedAt: { gte: weekAgo } },
      },
    },
    orderBy: { createdAt: "desc" },
    where: { projectId },
  });
}
async function loadAlerts(
  projectId: string,
  where: readonly Prisma.TriggeredAlertWhereInput[] = [],
) {
  const now = new Date();
  const baseWhere = {
    firedAt: { gte: new Date(now.getTime() - 48 * 60 * 60 * 1000) },
    rule: { projectId },
    ...visibleAlertSnoozeWhere(now),
  };
  return prisma.triggeredAlert.findMany({
    include: {
      deliveryAttempts: {
        include: {
          webhookEndpoint: { select: { description: true, publicId: true, url: true } },
        },
        orderBy: { attemptedAt: "desc" },
        take: 3,
      },
      keyword: {
        select: {
          device: true,
          locationId: true,
          locationRef: { select: { displayName: true, languageLabel: true } },
        },
      },
      rule: {
        select: {
          changePct: true,
          competitorDomain: true,
          conditionType: true,
          dropPositions: true,
          name: true,
          projectId: true,
          serpFeature: true,
          severity: true,
          thresholdPosition: true,
          topN: true,
        },
      },
    },
    orderBy: { firedAt: "desc" },
    take: 50,
    where: where.length ? { AND: [baseWhere, ...where] } : baseWhere,
  });
}

export { getAlertFeedStats } from "./alert-feed-stats";
export async function listAlertRuleViews(projectId: string): Promise<AlertRuleView[]> {
  const [rules, keywordData] = await Promise.all([
    loadRules(projectId),
    getRequestAlertKeywordData(projectId),
  ]);
  return rules.map((rule) => ruleView(rule, keywordData.labels));
}
export async function listTriggeredAlertViews(
  projectId: string,
  query: AlertFeedQuery = {},
): Promise<TriggeredAlertView[]> {
  const [alerts, keywordData] = await Promise.all([
    loadAlerts(projectId, query.where),
    getRequestAlertKeywordData(projectId),
  ]);
  return alerts.map((alert) => alertView(alert, keywordData.labels, query.marketsByLocation));
}

export async function listTriggeredAlertFeedViews(
  projectId: string,
  query: AlertFeedQuery = {},
): Promise<TriggeredAlertFeedView[]> {
  const [alerts, keywordData] = await Promise.all([
    loadAlerts(projectId, query.where),
    getRequestAlertKeywordData(projectId),
  ]);
  return alerts.map((alert) => alertFeedView(alert, keywordData.labels, query.marketsByLocation));
}
