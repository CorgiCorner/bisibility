import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { Context } from "@temporalio/activity";
import { deliverableAlertWhere } from "./transitions";

export const ALERT_NOT_DELIVERABLE = "Alert is no longer deliverable.";
export const DIGEST_OUTCOME_UNKNOWN = "Digest outcome is unknown after a retried attempt.";

export type SendGateResult =
  | { allowed: true; email: string; userId: string; projectId: string }
  | { allowed: false; reason: string };

export async function alertDeliveryAllowed(
  input: {
    alertIds: string[];
    projectId?: string;
    ruleId?: string;
    deliveryClaimToken?: string;
  },
  db: Pick<Prisma.TransactionClient, "triggeredAlert"> = prisma,
) {
  if (!input.alertIds.length) return [];
  return db.triggeredAlert.findMany({
    select: { id: true, publicId: true },
    where: {
      id: { in: input.alertIds },
      ...(input.ruleId ? { ruleId: input.ruleId } : {}),
      ...(input.deliveryClaimToken
        ? { deliveryClaimToken: input.deliveryClaimToken, deliveryState: "digesting" as const }
        : {}),
      rule: { enabled: true, ...(input.projectId ? { projectId: input.projectId } : {}) },
      ...deliverableAlertWhere(),
    },
  });
}

export async function allAlertsDeliverable(
  input: {
    alertIds: string[];
    projectId?: string;
    ruleId?: string;
  },
  db: Pick<Prisma.TransactionClient, "triggeredAlert"> = prisma,
) {
  if (!input.alertIds.length) return false;
  const rows = await alertDeliveryAllowed(input, db);
  return new Set(rows.map(({ id }) => id)).size === new Set(input.alertIds).size;
}

export async function alertEmailSendGate(input: {
  alertIds: string[];
  projectId?: string;
  ruleId?: string;
  userId?: string;
}): Promise<SendGateResult> {
  const { projectId, ruleId, userId } = input;
  if (!projectId || !ruleId || !userId) {
    return { allowed: false, reason: "Alert recipient is no longer available." };
  }
  const [user, project, members, preferences, deliverable] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { email: true } }),
    prisma.project.findUnique({ where: { id: projectId }, select: { ownerId: true } }),
    prisma.membership.findMany({ where: { projectId, userId }, select: { userId: true } }),
    prisma.notificationPreference.findMany({
      where: { projectId, userId },
      select: { alertEmail: true },
    }),
    allAlertsDeliverable(input),
  ]);
  if (!user?.email || !project || (project.ownerId !== userId && members.length === 0)) {
    return { allowed: false, reason: "Alert recipient is no longer available." };
  }
  if (preferences.some(({ alertEmail }) => !alertEmail)) {
    return { allowed: false, reason: "Alert email consent is disabled." };
  }
  if (!deliverable) return { allowed: false, reason: ALERT_NOT_DELIVERABLE };
  return { allowed: true, email: user.email, userId, projectId };
}

export class AlertDeliverySkipped extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "AlertDeliverySkipped";
  }
}

export async function requireAlertEmailSend(input: Parameters<typeof alertEmailSendGate>[0]) {
  const gate = await alertEmailSendGate(input);
  if (!gate.allowed) throw new AlertDeliverySkipped(gate.reason);
  return gate;
}

function activityAttempt() {
  try {
    return Context.current().info.attempt;
  } catch {
    return 1;
  }
}

/**
 * A digest channel refusal. A retry can follow an attempt that already reached the transport,
 * so its refusal must never let the finalizer requeue the digest: a stale refusal on a retry
 * is an unknown outcome, and any other refusal on a retry is marked as retried.
 */
export function digestRefusal(reason: string) {
  if (activityAttempt() === 1) return { delivered: false, skipped: true, reason };
  if (reason === ALERT_NOT_DELIVERABLE) {
    return { delivered: false, skipped: false, unknown: true, reason: DIGEST_OUTCOME_UNKNOWN };
  }
  return { delivered: false, retried: true, skipped: true, reason };
}

/** Email activities scheduled before stable ids existed carry only the recipient address. */
export async function resolveAlertEmailIds(input: {
  alertId: string;
  recipientEmail: string;
  recipientUserId?: string;
  projectInternalId?: string;
  ruleId?: string;
}) {
  if (input.recipientUserId && input.projectInternalId && input.ruleId) {
    return {
      userId: input.recipientUserId,
      projectId: input.projectInternalId,
      ruleId: input.ruleId,
    };
  }
  const [alert, user] = await Promise.all([
    prisma.triggeredAlert.findUnique({
      where: { id: input.alertId },
      select: { ruleId: true, rule: { select: { projectId: true } } },
    }),
    input.recipientUserId
      ? null
      : prisma.user.findUnique({ where: { email: input.recipientEmail }, select: { id: true } }),
  ]);
  return {
    userId: input.recipientUserId ?? user?.id,
    projectId: input.projectInternalId ?? alert?.rule.projectId,
    ruleId: input.ruleId ?? alert?.ruleId,
  };
}
