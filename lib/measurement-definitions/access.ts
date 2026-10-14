import "server-only";
import { AuthorizationError, type ResourceType } from "@/lib/auth/authorize";
import { canProjectAction } from "@/lib/auth/capabilities";
import { isPublicIdOfType } from "@/lib/db/public-id-resources";
import { ProjectReadOnlyError } from "@/lib/deployment/project-write-mode";
import type { Role } from "@/lib/generated/prisma/client";
import { DefinitionUnavailableError } from "./errors";
import type { DefinitionActorContext, DefinitionTransaction } from "./model";

/** Fresh database authority; actor.memberships is deliberately not consulted. No read-side audit writes. */
export async function definitionProjectScope(
  tx: DefinitionTransaction,
  context: DefinitionActorContext,
  projectPublicId: string,
  action: "read" | "update",
  resource: ResourceType = "keyword",
) {
  if (!context.actor) throw new AuthorizationError("unauthenticated");
  if (!isPublicIdOfType(projectPublicId, "prj")) throw new DefinitionUnavailableError();
  const project = await tx.project.findUnique({
    where: { publicId: projectPublicId },
    select: { id: true, publicId: true, writeMode: true, isSample: true },
  });
  if (!project) throw new DefinitionUnavailableError();
  await assertDefinitionActor(tx, context.actor.id, project.id, action, resource);
  if (action === "update") {
    await tx.$queryRaw`SELECT id FROM projects WHERE id=${project.id} FOR UPDATE`;
    const writable = await tx.project.findUnique({
      where: { id: project.id },
      select: { writeMode: true, isSample: true },
    });
    if (!writable || writable.writeMode !== "active" || writable.isSample)
      throw new ProjectReadOnlyError(project.id);
  }
  return project;
}
export async function assertDefinitionActor(
  tx: DefinitionTransaction,
  actorId: string,
  projectId: string,
  action: "read" | "update",
  resource: ResourceType = "keyword",
) {
  // Plain SELECTs support genuinely read-only transactions. Writes take locks through the separate path.
  const active =
    action === "read"
      ? await tx.$queryRaw<
          Array<{ id: string }>
        >`SELECT id FROM users WHERE id=${actorId} AND "deactivatedAt" IS NULL`
      : await tx.$queryRaw<
          Array<{ id: string }>
        >`SELECT id FROM users WHERE id=${actorId} AND "deactivatedAt" IS NULL FOR SHARE`;
  const members =
    action === "read"
      ? await tx.$queryRaw<
          Array<{ role: Role }>
        >`SELECT role FROM memberships WHERE "projectId"=${projectId} AND "userId"=${actorId}`
      : await tx.$queryRaw<
          Array<{ role: Role }>
        >`SELECT role FROM memberships WHERE "projectId"=${projectId} AND "userId"=${actorId} FOR SHARE`;
  if (
    active.length !== 1 ||
    members.length !== 1 ||
    !canProjectAction(members[0].role, action, resource)
  )
    throw new AuthorizationError("forbidden");
}
