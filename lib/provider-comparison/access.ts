import "server-only";
import { canProjectAction } from "@/lib/auth/capabilities";
import type { Prisma, Role } from "@/lib/generated/prisma/client";
import { assertOperationAccessInTransaction } from "@/lib/operations/access-extension";
export async function assertComparisonAccess(
  tx: Prisma.TransactionClient,
  projectId: string,
  actorId: string | null,
  write: boolean,
) {
  if (!actorId) throw new Error("Comparison access denied.");
  const [project] = await tx.$queryRaw<
    { ownerId: string }[]
  >`SELECT "ownerId" FROM projects WHERE id=${projectId} FOR SHARE`;
  const users = await tx.$queryRaw<
    { id: string }[]
  >`SELECT id FROM users WHERE id=${actorId} AND "deactivatedAt" IS NULL FOR SHARE`;
  if (!project || !users.length) throw new Error("Comparison access denied.");
  const members = await tx.$queryRaw<
    { role: Role }[]
  >`SELECT role FROM memberships WHERE "projectId"=${projectId} AND "userId"=${actorId} FOR SHARE`;
  const role = project.ownerId === actorId ? "owner" : members[0]?.role;
  if (!canProjectAction(role, write ? "create" : "read", "keyword"))
    throw new Error("Comparison access denied.");
  if (write) await assertOperationAccessInTransaction(tx, projectId);
}
