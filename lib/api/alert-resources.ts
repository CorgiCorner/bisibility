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

export type ApiTriggeredAlertView = Omit<TriggeredAlertView, "deliveryAttempts"> & {
  deliveryAttempts: ApiDeliveryAttempt[];
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

/** Converts shared UI alert-rule views into the strict REST wire resource. */
export async function alertRuleApiResources(rules: AlertRuleView[]): Promise<AlertRuleView[]> {
  const ruleIds = rules.map((rule) => rule.id).filter((id) => !isPublicIdOfType(id, "alr"));
  const recipientIds = rules
    .flatMap((rule) => rule.recipientIds)
    .filter((id) => !isPublicIdOfType(id, "usr"));
  const keywordIds = rules
    .filter((rule) => rule.targetType === "keyword")
    .flatMap((rule) => rule.targetIds)
    .filter((id) => !isPublicIdOfType(id, "kw"));
  const tagIds = rules
    .filter((rule) => rule.targetType === "tag")
    .flatMap((rule) => rule.targetIds)
    .filter((id) => !isPublicIdOfType(id, "tag"));
  const [ruleRows, recipientRows, keywordRows, tagRows] = await Promise.all([
    prisma.alertRule.findMany({
      select: { id: true, publicId: true },
      where: { id: { in: ruleIds } },
    }),
    prisma.user.findMany({
      select: { id: true, publicId: true },
      where: { id: { in: recipientIds } },
    }),
    prisma.keyword.findMany({
      select: { id: true, publicId: true },
      where: { id: { in: keywordIds } },
    }),
    prisma.tag.findMany({ select: { id: true, publicId: true }, where: { id: { in: tagIds } } }),
  ]);
  const rulePublicIds = publicIdByInternalId(ruleRows, "alr");
  const recipientPublicIds = publicIdByInternalId(recipientRows, "usr");
  const keywordPublicIds = publicIdByInternalId(keywordRows, "kw");
  const tagPublicIds = publicIdByInternalId(tagRows, "tag");

  return rules.map((rule) => ({
    ...rule,
    id: mappedPublicId(rulePublicIds, rule.id, "alr"),
    recipientIds: rule.recipientIds.map((id) => mappedPublicId(recipientPublicIds, id, "usr")),
    targetIds:
      rule.targetType === "keyword"
        ? rule.targetIds.map((id) => mappedPublicId(keywordPublicIds, id, "kw"))
        : rule.targetType === "tag"
          ? rule.targetIds.map((id) => mappedPublicId(tagPublicIds, id, "tag"))
          : [],
  }));
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

  return alerts.map((alert) => ({
    ...alert,
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
  }));
}
