import "server-only";

import { prisma } from "@/lib/db/prisma";
import { makePublicId } from "@/lib/db/public-id";
import type { Prisma } from "@/lib/generated/prisma/client";
import { downtrendStateKnown } from "./downtrend";
import type { AlertRankSnapshot } from "./evaluate";
import type { AlertConditionTypeInput } from "./schema";
import { visibleAlertSnoozeWhere } from "./snooze";

export const STATEFUL_ALERT_CONDITIONS: ReadonlySet<AlertConditionTypeInput> = new Set([
  "ctr_drop",
  "downtrend",
  "url_mismatch",
]);

export function isStatefulAlertCondition(conditionType: AlertConditionTypeInput) {
  return STATEFUL_ALERT_CONDITIONS.has(conditionType);
}

export function deliverableAlertWhere(now = new Date()): Prisma.TriggeredAlertWhereInput {
  return {
    status: { not: "resolved" },
    ...visibleAlertSnoozeWhere(now),
  };
}

export function statefulStateKnown(
  conditionType: AlertConditionTypeInput,
  after: AlertRankSnapshot,
) {
  if (conditionType === "ctr_drop") {
    return after.ctrDropMetrics != null;
  }
  if (conditionType === "downtrend") {
    return downtrendStateKnown(after.recentChecks);
  }
  return conditionType === "url_mismatch";
}

export async function resolveClearedTriggeredAlerts(
  keywordId: string,
  ruleId: string,
  now = new Date(),
) {
  return prisma.triggeredAlert.updateMany({
    data: { resolvedAt: now, status: "resolved" },
    where: { keywordId, ruleId, status: { not: "resolved" } },
  });
}

export async function hasOpenTriggeredAlert(keywordId: string, ruleId: string) {
  const alert = await prisma.triggeredAlert.findFirst({
    select: { id: true },
    where: { keywordId, ruleId, status: { not: "resolved" } },
  });
  return Boolean(alert);
}

export async function createTriggeredAlertOnce(
  data: Omit<Prisma.TriggeredAlertUncheckedCreateInput, "publicId"> & { publicId?: string },
) {
  try {
    return await prisma.triggeredAlert.create({
      data: { ...data, publicId: data.publicId ?? makePublicId("al") },
    });
  } catch (error) {
    if (data.rankCheckId !== null && data.rankCheckId !== undefined) {
      const existing = await prisma.triggeredAlert.findFirst({
        where: {
          keywordId: data.keywordId,
          rankCheckId: data.rankCheckId,
          ruleId: data.ruleId,
        },
      });
      if (existing) {
        return null;
      }
    }
    throw error;
  }
}
