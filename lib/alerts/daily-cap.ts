import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { AlertDeliveryState, Prisma } from "@/lib/generated/prisma/client";
import { MAX_ALERT_DELIVERIES_PER_RULE_PER_DAY } from "./limits";

export function utcDay(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

type DailyCapClient = Pick<Prisma.TransactionClient, "alertRuleDailyStat">;

async function ensureDailyStat(ruleId: string, day: Date, client: DailyCapClient = prisma) {
  await client.alertRuleDailyStat.upsert({
    create: { day, ruleId },
    update: {},
    where: { ruleId_day: { day, ruleId } },
  });
}

export async function reserveRuleDailyBudget(
  ruleId: string,
  now: Date,
  client: DailyCapClient = prisma,
) {
  const day = utcDay(now);
  await ensureDailyStat(ruleId, day, client);
  const result = await client.alertRuleDailyStat.updateMany({
    data: { sentCount: { increment: 1 } },
    where: {
      day,
      ruleId,
      sentCount: { lt: MAX_ALERT_DELIVERIES_PER_RULE_PER_DAY },
    },
  });
  return result.count === 1;
}

export async function reserveDeliveryBudgetOnce(input: {
  alertId: string;
  deliveryClaimToken?: string;
  deliveryState: AlertDeliveryState;
  now: Date;
  ruleId: string;
}) {
  return prisma.$transaction(async (tx) => {
    const marker = await tx.triggeredAlert.updateMany({
      data: { deliveryBudgetReservedAt: input.now },
      where: {
        ...(input.deliveryClaimToken ? { deliveryClaimToken: input.deliveryClaimToken } : {}),
        deliveryBudgetReservedAt: null,
        deliveryState: input.deliveryState,
        id: input.alertId,
      },
    });
    if (marker.count === 0) {
      const existing = await tx.triggeredAlert.findUnique({
        select: { deliveryBudgetReservedAt: true },
        where: { id: input.alertId },
      });
      return { granted: Boolean(existing?.deliveryBudgetReservedAt), reused: true };
    }

    const granted = await reserveRuleDailyBudget(input.ruleId, input.now, tx);
    if (!granted) {
      await tx.triggeredAlert.updateMany({
        data: { deliveryBudgetReservedAt: null },
        where: {
          ...(input.deliveryClaimToken ? { deliveryClaimToken: input.deliveryClaimToken } : {}),
          deliveryState: input.deliveryState,
          id: input.alertId,
        },
      });
    }
    return { granted, reused: false };
  });
}

export async function recordSuppressed(ruleId: string, now: Date, count: number) {
  const day = utcDay(now);
  await ensureDailyStat(ruleId, day);
  await prisma.alertRuleDailyStat.update({
    data: { suppressedCount: { increment: count } },
    where: { ruleId_day: { day, ruleId } },
  });
  const notice = await prisma.alertRuleDailyStat.updateMany({
    data: { overflowNotifiedAt: now },
    where: { day, overflowNotifiedAt: null, ruleId },
  });
  return { overflowNoticeDue: notice.count === 1 };
}
