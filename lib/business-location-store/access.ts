import "server-only";
import type { ResourceType } from "@/lib/auth/authorize";
import { AuthorizationError, authorize } from "@/lib/auth/authorize";
import { canProjectAction } from "@/lib/auth/capabilities";
import type { TrustedWriteContext } from "@/lib/business-locations/dto";
import { isPublicIdOfType } from "@/lib/db/public-id-resources";
import { assertProjectWritable, ProjectReadOnlyError } from "@/lib/deployment/project-write-mode";
import type { Role } from "@/lib/generated/prisma/client";
import { authorizeRetainedProjectRead } from "@/lib/rank-history/retained-read-authority";
import type { BusinessStoreContext, BusinessTransaction } from "./context";
import { BusinessLocationUnavailableError } from "./errors";

export async function businessProjectScope(
  tx: BusinessTransaction,
  context: BusinessStoreContext,
  publicId: string,
  action: "read" | "create" | "update",
  resource: ResourceType = "business_location",
) {
  if (!context.actor) throw new AuthorizationError("unauthenticated");
  if (context.readAuthority && action !== "read") throw new AuthorizationError("forbidden");
  const active = await tx.$queryRaw<
    Array<{ id: string }>
  >`SELECT id FROM users WHERE id=${context.actor.id} AND "deactivatedAt" IS NULL FOR SHARE`;
  if (active.length !== 1) throw new AuthorizationError("forbidden");
  if (!isPublicIdOfType(publicId, "prj")) throw new BusinessLocationUnavailableError();
  const reference = await tx.project.findFirst({ where: { publicId }, select: { id: true } });
  if (!reference) throw new BusinessLocationUnavailableError();
  if (action === "read")
    await tx.$queryRaw`SELECT id FROM projects WHERE id=${reference.id} FOR SHARE`;
  else await tx.$queryRaw`SELECT id FROM projects WHERE id=${reference.id} FOR UPDATE`;
  const project = await tx.project.findUnique({
    where: { id: reference.id },
    select: { id: true, publicId: true, writeMode: true, isSample: true },
  });
  if (!project) throw new BusinessLocationUnavailableError();
  const members = await tx.$queryRaw<
    Array<{ role: Role }>
  >`SELECT role FROM memberships WHERE "projectId"=${project.id} AND "userId"=${context.actor.id} FOR SHARE`;
  const actor = {
    id: context.actor.id,
    memberships: members.map(({ role }) => ({ projectId: project.id, role })),
  };
  const grant = authorize(actor, action, { projectId: project.id, type: resource });
  if (action !== "read") {
    if (project.isSample || project.writeMode !== "active")
      throw new ProjectReadOnlyError(project.id);
    assertProjectWritable(project);
  }
  return { project, actor, grant, context };
}
export type BusinessProjectScope = Awaited<ReturnType<typeof businessProjectScope>>;

export function businessWriteContext(scope: BusinessProjectScope): TrustedWriteContext {
  if (scope.context.readAuthority) throw new AuthorizationError("forbidden");
  assertProjectWritable(scope.project);
  authorize(scope.actor, "update", { projectId: scope.project.id, type: "business_location" });
  return {
    actorId: scope.actor.id,
    projectId: scope.project.id,
    canWrite: true,
    writeMode: "editable",
  };
}

export function businessPermissions(scope: BusinessProjectScope) {
  return {
    canRead: canProjectAction(scope.grant.role, "read", "business_location"),
    canWrite:
      !scope.context.readAuthority &&
      !scope.project.isSample &&
      scope.project.writeMode === "active" &&
      canProjectAction(scope.grant.role, "update", "business_location"),
  };
}

/** Read-only report authorization. No lock/writer options are exposed to request JSON. */
export async function businessReadProjectScope(
  tx: BusinessTransaction,
  context: BusinessStoreContext,
  publicId: string,
  resource: ResourceType = "business_location",
) {
  if (!context.actor) throw new AuthorizationError("unauthenticated");
  if (!isPublicIdOfType(publicId, "prj")) throw new BusinessLocationUnavailableError();
  if (context.readAuthority) {
    const project = await tx.project.findFirst({
      where: { publicId },
      select: { id: true, publicId: true, writeMode: true, isSample: true },
    });
    if (!project) throw new BusinessLocationUnavailableError();
    const { actor, grant } = await authorizeRetainedProjectRead(
      tx,
      context.readAuthority,
      context.actor,
      project,
      resource,
    );
    return { project, actor, grant, context };
  }
  const active = await tx.$queryRaw<
    Array<{ id: string }>
  >`SELECT id FROM users WHERE id=${context.actor.id} AND "deactivatedAt" IS NULL`;
  if (active.length !== 1) throw new AuthorizationError("forbidden");
  const project = await tx.project.findFirst({
    where: { publicId },
    select: { id: true, publicId: true, writeMode: true, isSample: true },
  });
  if (!project) throw new BusinessLocationUnavailableError();
  const members = await tx.$queryRaw<
    Array<{ role: Role }>
  >`SELECT role::text AS role FROM memberships WHERE "projectId"=${project.id} AND "userId"=${context.actor.id}`;
  const actor = {
    id: context.actor.id,
    memberships: members.map(({ role }) => ({ projectId: project.id, role })),
  };
  const grant = authorize(actor, "read", { projectId: project.id, type: resource });
  return { project, actor, grant, context };
}
