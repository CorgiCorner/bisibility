import "server-only";

import { prisma } from "@/lib/db/prisma";
import { type AuditStatus, writeAudit } from "./audit";

type SignInAuditInput = {
  email: string;
  userId?: string | null;
  status: AuditStatus;
  statusReason?: string;
};

const accountSelect = {
  id: true,
  memberships: { select: { projectId: true } },
  publicId: true,
} as const;

// Attribute known-account attempts to each project membership; unknown emails still
// produce one global event.
export async function recordSignInAudit({ email, userId, status, statusReason }: SignInAuditInput) {
  const account = await resolveAccount(email, userId);
  const base = {
    action: "auth.sign_in",
    // Failed attempts target the account but keep actorId null so the victim is not
    // recorded as the actor.
    actorId: status === "success" ? (account?.id ?? null) : null,
    after: { email, method: "email_otp" },
    status,
    statusReason,
    targetId: account?.publicId ?? "unknown-account",
    targetType: account ? "user" : "authentication",
  } as const;

  const projectIds = account?.memberships.map((membership) => membership.projectId) ?? [];
  if (projectIds.length === 0) {
    await writeAudit({ ...base });
    return;
  }
  await Promise.all(projectIds.map((projectId) => writeAudit({ ...base, projectId })));
}

function resolveAccount(email: string, userId?: string | null) {
  if (userId) {
    return prisma.user.findUnique({ select: accountSelect, where: { id: userId } });
  }
  if (email && email !== "unknown") {
    return prisma.user.findUnique({ select: accountSelect, where: { email } });
  }
  return null;
}
