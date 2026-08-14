import "server-only";
import type { AlertRuleView, TriggeredAlertView } from "@/lib/alerts/alert-data";
import { getRequestAlertKeywordData } from "@/lib/alerts/alert-request-data";
import { visibleAlertSnoozeWhere } from "@/lib/alerts/snooze";
import { prisma } from "@/lib/db/prisma";
import { type PublicIdPrefix, parsePublicId } from "@/lib/db/public-id";
import type { Prisma } from "@/lib/generated/prisma/client";

const conditionLabels = {
  change_pct: "position changes by percent",
  competitor_overtake: "competitor ranks above you",
  ctr_drop: "CTR drops against the 28-day baseline",
  downtrend: "down in 3 of last 5 checks",
  enters_top_n: "rank enters top N",
  exits_top_n: "rank exits top N",
  position_drop: "rank drops by N positions",
  serp_feature: "SERP feature appears",
  threshold: "rank crosses threshold",
  url_mismatch: "ranking URL differs from target URL",
};
const ALERT_FEED_WINDOW_MS = 48 * 60 * 60 * 1000;
function requiredPublicId(value: string | null, resource: string, prefix: PublicIdPrefix) {
  if (!value || parsePublicId(value)?.prefix !== prefix) {
    throw new Error(`${resource} public ID is not available.`);
  }
  return value;
}
function alertFeedWindowStart(now: Date) {
  return new Date(now.getTime() - ALERT_FEED_WINDOW_MS);
}
function relativeTime(date: Date) {
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) {
    return "just now";
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 48) {
    return `${hours}h ago`;
  }
  return `${Math.floor(hours / 24)}d ago`;
}
function positionText(position: number | null) {
  return position ? `#${position}` : "No rank";
}
function webhookEndpointLabel(
  channel: string,
  endpoint: { description: string | null; url: string } | null,
) {
  if (channel !== "webhook") return null;
  if (!endpoint) return "Deleted endpoint";
  return endpoint.description?.trim() || endpoint.url;
}
function payloadValue(payload: Prisma.JsonValue | null | undefined, key: string) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const value = payload[key as keyof typeof payload];
  return typeof value === "string" ? value : null;
}
function payloadList(payload: Prisma.JsonValue | null | undefined, key: string) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const value = payload[key as keyof typeof payload];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : null;
}
function conditionText(rule: {
  changePct: unknown;
  competitorDomain: string | null;
  conditionType: keyof typeof conditionLabels;
  dropPositions: number | null;
  serpFeature: string | null;
  thresholdPosition: number | null;
  topN: number | null;
}) {
  if (rule.conditionType === "threshold") {
    return `rank crosses below #${rule.thresholdPosition}`;
  }
  if (rule.conditionType === "change_pct") {
    return `position changes by ${Number(rule.changePct ?? 0)}%`;
  }
  if (rule.conditionType === "ctr_drop") {
    return `CTR drops by ${Number(rule.changePct ?? 0)}% vs the 28-day baseline`;
  }
  if (rule.conditionType === "position_drop") {
    return `rank drops by ${rule.dropPositions} positions`;
  }
  if (rule.conditionType === "downtrend") {
    return "down in 3 of last 5 checks";
  }
  if (rule.conditionType === "enters_top_n") {
    return `rank enters top ${rule.topN}`;
  }
  if (rule.conditionType === "exits_top_n") {
    return `rank exits top ${rule.topN}`;
  }
  if (rule.conditionType === "competitor_overtake") {
    return `${rule.competitorDomain} ranks above you`;
  }
  if (rule.conditionType === "serp_feature") {
    return `${rule.serpFeature} appears`;
  }
  if (rule.conditionType === "url_mismatch") {
    return "ranking URL differs from target URL";
  }
  return conditionLabels[rule.conditionType];
}
function scopeText(
  rule: {
    targetType: string;
    targets: {
      keywordId: string | null;
      tag?: { name: string } | null;
    }[];
  },
  keywordLabels: ReadonlyMap<string, string>,
) {
  if (rule.targetType === "all") {
    return "All keywords";
  }
  const names = rule.targets
    .map((target) => (target.keywordId ? keywordLabels.get(target.keywordId) : target.tag?.name))
    .filter((name): name is string => Boolean(name));
  if (names.length === 0) {
    return rule.targetType === "keyword" ? "Selected keywords" : "Selected tags";
  }
  return names.length === 1 ? names[0] : `${names[0]} +${names.length - 1}`;
}
function channelText(channels: string[]) {
  if (channels.length === 0) {
    return "In-app";
  }
  return channels.map((channel) => channel[0].toUpperCase() + channel.slice(1)).join(", ");
}
function ruleView(
  rule: Awaited<ReturnType<typeof loadRules>>[number],
  keywordLabels: ReadonlyMap<string, string>,
): AlertRuleView {
  return {
    changePct: rule.changePct === null ? null : Number(rule.changePct),
    channel: channelText(rule.channels),
    channels: rule.channels,
    condition: conditionText(rule),
    conditionType: rule.conditionType,
    competitorDomain: rule.competitorDomain,
    dropPositions: rule.dropPositions,
    enabled: rule.enabled,
    fires: `${rule.triggered.length} this week`,
    id: requiredPublicId(rule.publicId, "Alert rule", "alr"),
    marketIds: rule.markets.map(({ projectMarket }) =>
      requiredPublicId(projectMarket.publicId, "Project market", "pmkt"),
    ),
    name: rule.name,
    period: rule.conditionType === "ctr_drop" ? "7d vs prior 28d" : "Each check",
    recipientIds: rule.recipients.map(({ user }) =>
      requiredPublicId(user.publicId, "Recipient", "usr"),
    ),
    scope: scopeText(rule, keywordLabels),
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
): TriggeredAlertView {
  const payload = alert.payload;
  const severity = payloadValue(payload, "severity") ?? alert.rule.severity;
  return {
    action: payloadValue(payload, "action") ?? "Review the latest rank check.",
    ctas: payloadList(payload, "ctas") ?? ["Open keyword"],
    current: payloadValue(payload, "current") ?? positionText(alert.afterPosition),
    deliveryAttempts: alert.deliveryAttempts.map((attempt) => ({
      channel: attempt.channel,
      error: attempt.error,
      status: attempt.status,
      webhookEndpointId: attempt.webhookEndpoint
        ? requiredPublicId(attempt.webhookEndpoint.publicId, "Webhook endpoint", "we")
        : null,
      webhookEndpointLabel: webhookEndpointLabel(attempt.channel, attempt.webhookEndpoint),
      when: relativeTime(attempt.attemptedAt),
    })),
    deliveryState: alert.deliveryState,
    headline: payloadValue(payload, "headline") ?? alert.rule.name,
    id: requiredPublicId(alert.publicId, "Triggered alert", "al"),
    keyword: keywordLabels.get(alert.keywordId) ?? "Unknown keyword",
    location: alert.keyword.locationRef.displayName,
    device: alert.keyword.device,
    previous: payloadValue(payload, "previous") ?? positionText(alert.beforePosition),
    rankingUrl: payloadValue(payload, "rankingUrl"),
    rule: alert.rule.name,
    severity: severity === "info" || severity === "urgent" ? severity : "warning",
    targetUrl: payloadValue(payload, "targetUrl"),
    unread: alert.status === "firing",
    when: relativeTime(alert.firedAt),
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
async function loadAlerts(projectId: string) {
  const now = new Date();
  return prisma.triggeredAlert.findMany({
    include: {
      deliveryAttempts: {
        include: {
          webhookEndpoint: { select: { description: true, publicId: true, url: true } },
        },
        orderBy: { attemptedAt: "desc" },
        take: 3,
      },
      keyword: { select: { device: true, locationRef: { select: { displayName: true } } } },
      rule: { select: { conditionType: true, name: true, projectId: true, severity: true } },
    },
    orderBy: { firedAt: "desc" },
    take: 50,
    where: {
      firedAt: { gte: alertFeedWindowStart(now) },
      rule: { projectId },
      ...visibleAlertSnoozeWhere(now),
    },
  });
}
export async function getAlertFeedStats(projectId: string) {
  const now = new Date();
  const windowStart = alertFeedWindowStart(now);
  const [stats] = await prisma.$queryRaw<
    { firedInWindowCount: bigint; snoozedInWindowCount: bigint; totalCount: bigint }[]
  >`
    SELECT
      COUNT(*) FILTER (WHERE ta."firedAt" >= ${windowStart}) AS "firedInWindowCount",
      COUNT(*) FILTER (
        WHERE ta."firedAt" >= ${windowStart} AND ta."snoozedUntil" > ${now}
      ) AS "snoozedInWindowCount",
      COUNT(*) AS "totalCount"
    FROM "triggered_alerts" ta
    JOIN "alert_rules" ar ON ar.id = ta."ruleId"
    WHERE ar."projectId" = ${projectId}
  `;
  return {
    firedInWindowCount: Number(stats?.firedInWindowCount ?? 0),
    snoozedInWindowCount: Number(stats?.snoozedInWindowCount ?? 0),
    totalCount: Number(stats?.totalCount ?? 0),
  };
}
export async function listAlertRuleViews(projectId: string): Promise<AlertRuleView[]> {
  const [rules, keywordData] = await Promise.all([
    loadRules(projectId),
    getRequestAlertKeywordData(projectId),
  ]);
  return rules.map((rule) => ruleView(rule, keywordData.labels));
}
export async function listTriggeredAlertViews(projectId: string): Promise<TriggeredAlertView[]> {
  const [alerts, keywordData] = await Promise.all([
    loadAlerts(projectId),
    getRequestAlertKeywordData(projectId),
  ]);
  return alerts.map((alert) => alertView(alert, keywordData.labels));
}
