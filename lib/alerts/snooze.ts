import type { Prisma } from "@/lib/generated/prisma/client";

const ALERT_SNOOZE_HOURS = 24;

export function alertSnoozedUntil(now = new Date()) {
  return new Date(now.getTime() + ALERT_SNOOZE_HOURS * 60 * 60 * 1000);
}

export function visibleAlertSnoozeWhere(now = new Date()): Prisma.TriggeredAlertWhereInput {
  return {
    OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }],
  };
}

export function activeAlertSnoozeWhere(now = new Date()): Prisma.TriggeredAlertWhereInput {
  return { snoozedUntil: { gt: now } };
}
