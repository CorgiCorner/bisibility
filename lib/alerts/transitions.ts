import "server-only";

import { prisma } from "@/lib/db/prisma";
import { makePublicId } from "@/lib/db/public-id";
import type { Prisma } from "@/lib/generated/prisma/client";
import { downtrendStateKnown } from "./downtrend";
import type { AlertRankSnapshot } from "./evaluate";
import type { AlertConditionTypeInput } from "./schema";
import { activeAlertSnoozeWhere, visibleAlertSnoozeWhere } from "./snooze";

type TriggeredAlertStore = Pick<Prisma.TransactionClient, "triggeredAlert">;

const OPEN_INCIDENT_LOCK_TIMEOUT_MS = 20_000;

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

export function clearedIncidentWhere(
  keywordId: string,
  ruleId: string,
  checkedAt?: Date,
): Prisma.TriggeredAlertWhereInput {
  const open = { keywordId, ruleId, status: { not: "resolved" as const } };
  if (!checkedAt) return open;
  return {
    ...open,
    OR: [
      { rankCheck: { is: { checkedAt: { lt: checkedAt } } } },
      { rankCheckId: null, firedAt: { lt: checkedAt } },
    ],
  };
}

export async function resolveClearedTriggeredAlerts(
  keywordId: string,
  ruleId: string,
  now = new Date(),
  scope: { checkedAt?: Date; client?: TriggeredAlertStore } = {},
) {
  const client = scope.client ?? prisma;
  return client.triggeredAlert.updateMany({
    data: { resolvedAt: scope.checkedAt ?? now, status: "resolved" },
    where: clearedIncidentWhere(keywordId, ruleId, scope.checkedAt),
  });
}

export async function hasOpenTriggeredAlert(
  keywordId: string,
  ruleId: string,
  client: TriggeredAlertStore = prisma,
) {
  const alert = await client.triggeredAlert.findFirst({
    select: { id: true },
    where: { keywordId, ruleId, status: { not: "resolved" } },
  });
  return Boolean(alert);
}

function openIncidentLockKey(ruleId: string, keywordId: string) {
  return `alert-open-incident:${ruleId}:${keywordId}`;
}

function sameCheckWhere(data: { keywordId: string; rankCheckId?: string | null; ruleId: string }) {
  if (data.rankCheckId == null) return null;
  return {
    keywordId: data.keywordId,
    rankCheckId: data.rankCheckId,
    ruleId: data.ruleId,
  };
}

export function newerResolvedIncidentWhere(
  keywordId: string,
  ruleId: string,
  checkedAt: Date,
): Prisma.TriggeredAlertWhereInput {
  return {
    keywordId,
    OR: [
      { rankCheck: { is: { checkedAt: { gt: checkedAt } } } },
      { firedAt: { gt: checkedAt }, rankCheckId: null },
      { resolvedAt: { gt: checkedAt } },
    ],
    ruleId,
    status: "resolved",
  };
}

async function hasNewerResolvedIncident(
  client: TriggeredAlertStore,
  input: { checkedAt?: Date; keywordId: string; ruleId: string },
) {
  if (!input.checkedAt) return false;
  const resolved = await client.triggeredAlert.findFirst({
    select: { id: true },
    where: newerResolvedIncidentWhere(input.keywordId, input.ruleId, input.checkedAt),
  });
  return Boolean(resolved);
}

export async function settleStatefulIncident<T>(input: {
  checkedAt?: Date;
  create: (tx: Prisma.TransactionClient) => Promise<T | null>;
  keywordId: string;
  matched: boolean;
  ruleId: string;
  stateKnown: boolean;
}) {
  return prisma.$transaction(
    async (tx) => {
      const lockKey = openIncidentLockKey(input.ruleId, input.keywordId);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
      if (!input.matched) {
        if (input.stateKnown) {
          await resolveClearedTriggeredAlerts(input.keywordId, input.ruleId, new Date(), {
            checkedAt: input.checkedAt,
            client: tx,
          });
        }
        return null;
      }
      const snoozed = await tx.triggeredAlert.findFirst({
        select: { id: true },
        where: {
          keywordId: input.keywordId,
          ruleId: input.ruleId,
          ...activeAlertSnoozeWhere(),
        },
      });
      if (snoozed || (await hasOpenTriggeredAlert(input.keywordId, input.ruleId, tx))) return null;
      if (await hasNewerResolvedIncident(tx, input)) return null;
      return input.create(tx);
    },
    { timeout: OPEN_INCIDENT_LOCK_TIMEOUT_MS },
  );
}

export async function createTriggeredAlertOnce(
  data: Omit<Prisma.TriggeredAlertUncheckedCreateInput, "publicId"> & { publicId?: string },
  client: TriggeredAlertStore = prisma,
) {
  const identity = sameCheckWhere(data);
  if (identity) {
    const prior = await client.triggeredAlert.findFirst({ where: identity });
    if (prior) return null;
  }
  try {
    return await client.triggeredAlert.create({
      data: { ...data, publicId: data.publicId ?? makePublicId("al") },
    });
  } catch (error) {
    // A failed insert aborts the surrounding transaction. A follow-up read then
    // throws 25P02 and hides the original error, so only an autocommit client re-reads.
    if (
      client === prisma &&
      identity &&
      (await client.triggeredAlert.findFirst({ where: identity }))
    ) {
      return null;
    }
    throw error;
  }
}
