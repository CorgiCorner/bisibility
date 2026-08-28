import "server-only";

import { prisma } from "@/lib/db/prisma";

export type AlertEmailRecipient = { email: string; userId: string };

type RuleRecipients = {
  createdBy: { email: string; id: string } | null;
  recipients: { user: { email: string; id: string } }[];
};

export function resolveAlertRuleRecipients(rule: RuleRecipients): AlertEmailRecipient[] {
  if (rule.recipients.length > 0) {
    return rule.recipients.map(({ user }) => ({ email: user.email, userId: user.id }));
  }
  return rule.createdBy ? [{ email: rule.createdBy.email, userId: rule.createdBy.id }] : [];
}

export async function filterAlertEmailRecipients(
  projectId: string,
  recipients: AlertEmailRecipient[],
) {
  if (recipients.length === 0) return [];
  const userIds = recipients.map(({ userId }) => userId);
  const [members, project, preferences] = await Promise.all([
    prisma.membership.findMany({
      select: { userId: true },
      where: { projectId, userId: { in: userIds } },
    }),
    // authorize() accepts ownerId without a membership row; delivery must agree with it.
    prisma.project.findUnique({ select: { ownerId: true }, where: { id: projectId } }),
    prisma.notificationPreference.findMany({
      select: { alertEmail: true, userId: true },
      where: { projectId, userId: { in: userIds } },
    }),
  ]);
  // Membership is the source of truth: a removed member must never receive project alerts,
  // even when a stale recipient or preference row still names them.
  const current = new Set(members.map(({ userId }) => userId));
  if (project?.ownerId) current.add(project.ownerId);
  const disabled = new Set(
    preferences.filter(({ alertEmail }) => !alertEmail).map(({ userId }) => userId),
  );
  return recipients.filter(({ userId }) => current.has(userId) && !disabled.has(userId));
}
