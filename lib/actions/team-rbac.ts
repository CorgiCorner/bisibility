import "server-only";

import { type Actor, authorize } from "@/lib/auth/authorize";
import { prisma } from "@/lib/db/prisma";

const adminRoles = ["admin", "owner"] as const;
const adminTier = new Set<string>(adminRoles);

export function assertOwnerForAdminTier(
  actor: Actor,
  projectId: string,
  currentRole: string,
  nextRole?: string,
) {
  if (!adminTier.has(currentRole) && !(nextRole !== undefined && adminTier.has(nextRole))) return;
  authorize(actor, "manage", { projectId, type: "team", requiredRole: "owner" });
}

export async function assertAdminOrOwnerRemains(
  projectId: string,
  currentRole: string,
  nextRole?: string,
) {
  if (!adminTier.has(currentRole) || (nextRole && adminTier.has(nextRole))) return;
  const managerCount = await prisma.membership.count({
    where: { projectId, role: { in: [...adminRoles] } },
  });
  if (managerCount <= 1) {
    throw new Error("At least one admin or owner must remain on the project.");
  }
}
