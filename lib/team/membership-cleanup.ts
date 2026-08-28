import "server-only";

import type { Prisma } from "@/lib/generated/prisma/client";

type Tx = Prisma.TransactionClient;

/** Everything that must disappear with a membership so ex-members stop receiving project data. */
export async function removeMembershipSideEffects(
  tx: Tx,
  input: { projectId: string; userId: string },
) {
  await tx.alertRuleRecipient.deleteMany({
    where: { rule: { projectId: input.projectId }, userId: input.userId },
  });
  await tx.notificationPreference.deleteMany({
    where: { projectId: input.projectId, userId: input.userId },
  });
}
