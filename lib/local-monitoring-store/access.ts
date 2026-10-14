import "server-only";
import { AuthorizationError, authorize } from "@/lib/auth/authorize";
import { isPublicIdOfType } from "@/lib/db/public-id-resources";
import { assertProjectWritable } from "@/lib/deployment/project-write-mode";
import type { Role } from "@/lib/generated/prisma/client";
import { authorizeRetainedProjectRead } from "@/lib/rank-history/retained-read-authority";
import type { LocalStoreContext, LocalTransaction } from "./context";
import { LocalMeasurementUnavailableError } from "./errors";

export async function localProjectScope(
  tx: LocalTransaction,
  context: LocalStoreContext,
  publicId: string,
  action: "read" | "create" | "update",
  resource: "local_measurement_target" | "local_measurement_run" = "local_measurement_run",
) {
  if (!context.actor) throw new AuthorizationError("unauthenticated");
  if (context.readAuthority && action !== "read") throw new AuthorizationError("forbidden");
  if (!isPublicIdOfType(publicId, "prj")) throw new LocalMeasurementUnavailableError();
  const reference = await tx.project.findFirst({ where: { publicId }, select: { id: true } });
  if (!reference) throw new LocalMeasurementUnavailableError();
  if (action === "read")
    await tx.$queryRaw`SELECT id FROM projects WHERE id=${reference.id} FOR SHARE`;
  else await tx.$queryRaw`SELECT id FROM projects WHERE id=${reference.id} FOR UPDATE`;
  const project = await tx.project.findUnique({
    where: { id: reference.id },
    select: { id: true, publicId: true, writeMode: true },
  });
  if (!project) throw new AuthorizationError("forbidden");
  if (context.readAuthority) {
    const { actor, grant } = await authorizeRetainedProjectRead(
      tx,
      context.readAuthority,
      context.actor,
      project,
      resource,
    );
    return { actor, grant, project, context };
  }
  const users = await tx.$queryRaw<
    Array<{ id: string; deactivatedAt: Date | null }>
  >`SELECT id,"deactivatedAt" FROM users WHERE id=${context.actor.id} FOR SHARE`;
  if (!project || !users[0] || users[0].deactivatedAt) throw new AuthorizationError("forbidden");
  const memberships = await tx.$queryRaw<
    Array<{ role: Role }>
  >`SELECT role FROM memberships WHERE "projectId"=${project.id} AND "userId"=${context.actor.id} FOR SHARE`;
  const actor = {
    id: context.actor.id,
    memberships: memberships.map(({ role }) => ({ projectId: project.id, role })),
  };
  const grant = authorize(actor, action, { projectId: project.id, type: resource });
  if (action !== "read") assertProjectWritable(project);
  return { actor, grant, project, context };
}
export type LocalProjectScope = Awaited<ReturnType<typeof localProjectScope>>;
