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
  const preferences = await prisma.notificationPreference.findMany({
    select: { alertEmail: true, userId: true },
    where: { projectId, userId: { in: recipients.map(({ userId }) => userId) } },
  });
  const disabled = new Set(
    preferences.filter(({ alertEmail }) => !alertEmail).map(({ userId }) => userId),
  );
  return recipients.filter(({ userId }) => !disabled.has(userId));
}
