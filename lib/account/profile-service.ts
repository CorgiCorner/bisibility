import "server-only";

import { requiredPublicAuditId, writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";

/** Shared by the session action and personal-token API; callers authorize and revalidate. */
export async function updateProfileNameRecord(userId: string, name: string) {
  const before = await prisma.user.findUnique({
    select: { name: true, publicId: true },
    where: { id: userId },
  });
  if (!before) {
    throw new Error("Account not found.");
  }

  const updated = await prisma.user.update({
    data: { name },
    select: { name: true },
    where: { id: userId },
  });

  await writeAudit({
    action: "account.profile_updated",
    actorId: userId,
    after: { name: updated.name },
    before: { name: before.name },
    targetId: requiredPublicAuditId(before.publicId, "usr", "User"),
    targetType: "user",
  });

  return { name: updated.name };
}
