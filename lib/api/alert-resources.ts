import "server-only";

import type { AlertRuleView, TriggeredAlertView } from "@/lib/alerts/alert-data";
import { prisma } from "@/lib/db/prisma";
import { isPublicIdOfType } from "@/lib/db/public-id";
import { requireApiPublicId } from "./public-id";

type PublicRow = { id: string; publicId: string | null };

type ApiDeliveryAttempt = Omit<
  TriggeredAlertView["deliveryAttempts"][number],
  "id" | "webhookEndpointId"
> & {
  webhookEndpointId: string | null;
};

export type ApiTriggeredAlertView = Omit<
  TriggeredAlertView,
  "deliveryAttempts" | "device" | "location"
> & {
  deliveryAttempts: ApiDeliveryAttempt[];
};

/**
 * The REST resource predates the localized alert-rule presentation. Keep its
 * stable text fields at this boundary while the application uses structured
 * values for document-local rendering.
 */
export type ApiAlertRuleView = Omit<
  AlertRuleView,
  "firedThisWeek" | "marketScope" | "period" | "scope"
> & {
  channel: string;
  condition: string;
  fires: string;
  marketScope?: string;
  period: string;
  scope: string;
};

function publicIdByInternalId(rows: PublicRow[], prefix: Parameters<typeof requireApiPublicId>[1]) {
  return new Map(rows.map((row) => [row.id, requireApiPublicId(row.publicId ?? "", prefix)]));
}

function mappedPublicId(
  map: ReadonlyMap<string, string>,
  id: string,
  prefix: Parameters<typeof requireApiPublicId>[1],
) {
  if (isPublicIdOfType(id, prefix)) return id;
  return requireApiPublicId(map.get(id) ?? "", prefix);
}

function legacyChannel(channels: readonly string[]) {
  if (channels.length === 0) return "In-app";
  return channels.map((channel) => channel[0]?.toUpperCase() + channel.slice(1)).join(", ");
}

function legacyCondition(rule: AlertRuleView) {
  switch (rule.conditionType) {
    case "threshold":
      return `rank crosses below #${rule.thresholdPosition}`;
    case "change_pct":
      return `position changes by ${rule.changePct ?? 0}%`;
    case "ctr_drop":
      return `CTR drops by ${rule.changePct ?? 0}% vs the 28-day baseline`;
    case "position_drop":
      return `rank drops by ${rule.dropPositions} positions`;
    case "downtrend":
      return "down in 3 of last 5 checks";
    case "enters_top_n":
      return `rank enters top ${rule.topN}`;
    case "exits_top_n":
      return `rank exits top ${rule.topN}`;
    case "competitor_overtake":
      return `${rule.competitorDomain} ranks above you`;
    case "serp_feature":
      return `${rule.serpFeature} appears`;
    case "url_mismatch":
      return "ranking URL differs from target URL";
  }
}

function legacyScope(rule: AlertRuleView) {
  if (rule.targetType === "all") return "All keywords";
  if (rule.scope.labels.length === 0) {
    return rule.targetType === "keyword" ? "Selected keywords" : "Selected tags";
  }
  return rule.scope.labels.length === 1
    ? rule.scope.labels[0]
    : `${rule.scope.labels[0]} +${rule.scope.labels.length - 1}`;
}

function legacyMarketScope(rule: AlertRuleView) {
  if (!rule.marketScope) return undefined;
  return rule.marketScope.label ?? `${rule.marketScope.count} markets`;
}

function alertRuleApiResource(rule: AlertRuleView): ApiAlertRuleView {
  const { firedThisWeek: _firedThisWeek, marketScope: _marketScope, period, scope, ...rest } = rule;
  const marketScope = legacyMarketScope(rule);
  return {
    ...rest,
    channel: legacyChannel(rule.channels),
    condition: legacyCondition(rule),
    fires: `${rule.firedThisWeek} this week`,
    ...(marketScope ? { marketScope } : {}),
    period: period === "ctr_baseline" ? "7d vs prior 28d" : "Each check",
    scope: legacyScope(rule),
  };
}

/** Converts shared UI alert-rule views into the strict REST wire resource. */
export async function alertRuleApiResources(rules: AlertRuleView[]): Promise<ApiAlertRuleView[]> {
  const ruleIds = rules.map((rule) => rule.id).filter((id) => !isPublicIdOfType(id, "alr"));
  const recipientIds = rules
    .flatMap((rule) => rule.recipientIds)
    .filter((id) => !isPublicIdOfType(id, "usr"));
  const marketIds = rules
    .flatMap((rule) => rule.marketIds)
    .filter((id) => !isPublicIdOfType(id, "pmkt"));
  const keywordIds = rules
    .filter((rule) => rule.targetType === "keyword")
    .flatMap((rule) => rule.targetIds)
    .filter((id) => !isPublicIdOfType(id, "kw"));
  const tagIds = rules
    .filter((rule) => rule.targetType === "tag")
    .flatMap((rule) => rule.targetIds)
    .filter((id) => !isPublicIdOfType(id, "tag"));
  const [ruleRows, recipientRows, marketRows, keywordRows, tagRows] = await Promise.all([
    prisma.alertRule.findMany({
      select: { id: true, publicId: true },
      where: { id: { in: ruleIds } },
    }),
    prisma.user.findMany({
      select: { id: true, publicId: true },
      where: { id: { in: recipientIds } },
    }),
    prisma.projectMarket.findMany({
      select: { id: true, publicId: true },
      where: { id: { in: marketIds } },
    }),
    prisma.keyword.findMany({
      select: { id: true, publicId: true },
      where: { id: { in: keywordIds } },
    }),
    prisma.tag.findMany({ select: { id: true, publicId: true }, where: { id: { in: tagIds } } }),
  ]);
  const rulePublicIds = publicIdByInternalId(ruleRows, "alr");
  const recipientPublicIds = publicIdByInternalId(recipientRows, "usr");
  const marketPublicIds = publicIdByInternalId(marketRows, "pmkt");
  const keywordPublicIds = publicIdByInternalId(keywordRows, "kw");
  const tagPublicIds = publicIdByInternalId(tagRows, "tag");

  return rules.map((rule) => {
    const resource = alertRuleApiResource(rule);
    return {
      ...resource,
      id: mappedPublicId(rulePublicIds, rule.id, "alr"),
      marketIds: rule.marketIds.map((id) => mappedPublicId(marketPublicIds, id, "pmkt")),
      recipientIds: rule.recipientIds.map((id) => mappedPublicId(recipientPublicIds, id, "usr")),
      targetIds:
        rule.targetType === "keyword"
          ? rule.targetIds.map((id) => mappedPublicId(keywordPublicIds, id, "kw"))
          : rule.targetType === "tag"
            ? rule.targetIds.map((id) => mappedPublicId(tagPublicIds, id, "tag"))
            : [],
    };
  });
}

/** Converts shared UI alert-feed views into the strict REST wire resource. */
export async function triggeredAlertApiResources(
  alerts: TriggeredAlertView[],
): Promise<ApiTriggeredAlertView[]> {
  const alertIds = alerts.map((alert) => alert.id).filter((id) => !isPublicIdOfType(id, "al"));
  const endpointIds = alerts.flatMap((alert) =>
    alert.deliveryAttempts.flatMap((attempt) =>
      attempt.webhookEndpointId && !isPublicIdOfType(attempt.webhookEndpointId, "we")
        ? [attempt.webhookEndpointId]
        : [],
    ),
  );
  const [alertRows, endpointRows] = await Promise.all([
    prisma.triggeredAlert.findMany({
      select: { id: true, publicId: true },
      where: { id: { in: alertIds } },
    }),
    prisma.webhookEndpoint.findMany({
      select: { id: true, publicId: true },
      where: { id: { in: endpointIds } },
    }),
  ]);
  const alertPublicIds = publicIdByInternalId(alertRows, "al");
  const endpointPublicIds = publicIdByInternalId(endpointRows, "we");

  return alerts.map((alert) => {
    const { device: _device, location: _location, ...apiAlert } = alert;
    return {
      ...apiAlert,
      deliveryAttempts: alert.deliveryAttempts.map((rawAttempt) => {
        const {
          id: _id,
          webhookEndpointId,
          ...attempt
        } = rawAttempt as typeof rawAttempt & {
          id?: string;
        };
        return {
          ...attempt,
          webhookEndpointId: webhookEndpointId
            ? mappedPublicId(endpointPublicIds, webhookEndpointId, "we")
            : null,
        };
      }),
      id: mappedPublicId(alertPublicIds, alert.id, "al"),
    };
  });
}
