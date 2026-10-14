import "server-only";
import { type Actor, AuthorizationError, authorize } from "@/lib/auth/authorize";
import { canProjectAction } from "@/lib/auth/capabilities";
import { isPublicIdOfType } from "@/lib/db/public-id";
import { assertProjectWritable, isProjectReadOnly } from "@/lib/deployment/project-write-mode";
import type { Prisma, Role } from "@/lib/generated/prisma/client";

export class UsageDisplayUnavailableError extends Error {}

/** Re-read session user and membership under the same project lock as its settings. */
export async function usageDisplayProjectScope(
  tx: Prisma.TransactionClient,
  suppliedActor: Actor | null,
  publicId: string,
  action: "read" | "update",
) {
  if (!suppliedActor) throw new AuthorizationError("unauthenticated");
  if (!isPublicIdOfType(publicId, "prj")) throw new UsageDisplayUnavailableError();
  const reference = await tx.project.findFirst({ where: { publicId }, select: { id: true } });
  if (!reference) throw new UsageDisplayUnavailableError();
  if (action === "update")
    await tx.$queryRaw`SELECT id FROM projects WHERE id=${reference.id} FOR UPDATE`;
  else await tx.$queryRaw`SELECT id FROM projects WHERE id=${reference.id} FOR SHARE`;
  const project = await tx.project.findUnique({
    where: { id: reference.id },
    select: { id: true, publicId: true, writeMode: true },
  });
  if (!project) throw new UsageDisplayUnavailableError();
  const active = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM users WHERE id=${suppliedActor.id} AND "deactivatedAt" IS NULL FOR SHARE`;
  if (active.length !== 1 || active[0].id !== suppliedActor.id)
    throw new AuthorizationError("forbidden");
  const memberships = await tx.$queryRaw<Array<{ role: Role }>>`
    SELECT role FROM memberships WHERE "userId"=${suppliedActor.id}
    AND "projectId"=${project.id} FOR SHARE`;
  const actor = {
    id: suppliedActor.id,
    memberships: memberships.map(({ role }) => ({ projectId: project.id, role })),
  };
  const grant = authorize(actor, action, { projectId: project.id, type: "project_defaults" });
  if (action === "update") assertProjectWritable(project);
  return {
    actor,
    project,
    canEdit:
      !isProjectReadOnly(project.writeMode) &&
      canProjectAction(grant.role, "update", "project_defaults"),
  };
}
