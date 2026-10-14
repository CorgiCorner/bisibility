import "server-only";

import { ProjectNotFoundError } from "@/lib/actions/_shared";
import {
  type Action,
  type Actor,
  AuthorizationError,
  authorize,
  getProjectRole,
} from "@/lib/auth/authorize";
import { canDeleteProjectSavedView, canProjectAction } from "@/lib/auth/capabilities";
import { isPublicIdOfType } from "@/lib/db/public-id";
import { assertProjectWritable, isProjectReadOnly } from "@/lib/deployment/project-write-mode";
import type { Prisma, PrismaClient, Role } from "@/lib/generated/prisma/client";
import type { CanonicalSavedViewRecord, SavedViewVisibility } from "./canonical-model";
import { personalSessionUserId, type SavedViewContext } from "./context";
import { SavedViewUnavailableError } from "./errors";

export type ViewTransaction = Prisma.TransactionClient;
export type ViewDatabase = Pick<PrismaClient, "$transaction">;

/** Keep membership revocation and project write-mode changes outside this transaction. */
export async function savedViewProjectScope(
  tx: ViewTransaction,
  context: SavedViewContext,
  publicId: string,
) {
  if (!isPublicIdOfType(publicId, "prj")) throw new ProjectNotFoundError();
  const reference = await tx.project.findFirst({ select: { id: true }, where: { publicId } });
  if (!reference) throw new ProjectNotFoundError();
  await tx.$queryRaw`SELECT id FROM projects WHERE id=${reference.id} FOR SHARE`;
  const project = await tx.project.findUniqueOrThrow({
    select: { id: true, publicId: true, isSample: true, writeMode: true },
    where: { id: reference.id },
  });
  let actor = context.actor;
  if (context.transport === "session") {
    const userId = personalSessionUserId(context);
    const active = await tx.$queryRaw<
      Array<{ id: string }>
    >`SELECT id FROM users WHERE id=${userId} AND "deactivatedAt" IS NULL FOR SHARE`;
    if (active.length !== 1) throw new AuthorizationError("forbidden");
    const memberships = await tx.$queryRaw<Array<{ role: Role }>>`
      SELECT role FROM memberships WHERE "userId"=${userId}
      AND "projectId"=${project.id} FOR SHARE`;
    actor = {
      ...actor,
      memberships: memberships.map(({ role }) => ({ projectId: project.id, role })),
    };
  }
  authorize(actor, "read", { projectId: project.id, type: "saved_view" });
  return { actor, project };
}

export type ViewScope = Awaited<ReturnType<typeof savedViewProjectScope>>;

export function visibleSavedViews(projectId: string, context?: SavedViewContext) {
  return context?.transport === "session"
    ? {
        projectId,
        OR: [
          { visibility: "project" as const },
          { visibility: "private" as const, ownerId: personalSessionUserId(context) },
        ],
      }
    : { projectId, visibility: "project" as const };
}

export function authorizeViewWrite(
  scope: ViewScope,
  context: SavedViewContext,
  action: Exclude<Action, "read" | "manage">,
  view: Pick<CanonicalSavedViewRecord, "visibility" | "ownerId" | "createdById">,
) {
  if (view.visibility === "private") {
    const userId = personalSessionUserId(context);
    if (view.ownerId !== userId) throw new SavedViewUnavailableError();
    authorize(scope.actor, action, {
      ownerId: userId,
      projectId: scope.project.id,
      type: "personal_saved_view",
    });
    return;
  }
  const sharedAction =
    action === "delete" &&
    context.auditActorId !== null &&
    view.createdById === context.auditActorId
      ? "update"
      : action;
  authorize(scope.actor, sharedAction, { projectId: scope.project.id, type: "saved_view" });
  assertProjectWritable(scope.project);
}

export function authorizeViewCreate(
  scope: ViewScope,
  context: SavedViewContext,
  visibility: SavedViewVisibility,
) {
  authorizeViewWrite(scope, context, "create", {
    createdById: context.auditActorId,
    ownerId: visibility === "private" ? personalSessionUserId(context) : null,
    visibility,
  });
}

export function savedViewAccess(
  actor: Actor,
  projectId: string,
  view: Pick<CanonicalSavedViewRecord, "ownerId" | "visibility" | "createdById">,
  writeMode?: unknown,
) {
  if (view.visibility === "private") {
    const owns = view.ownerId === actor.id && getProjectRole(actor, projectId) !== null;
    return { canDelete: owns, canEdit: owns };
  }
  const role = getProjectRole(actor, projectId);
  return {
    canDelete:
      !isProjectReadOnly(writeMode) && canDeleteProjectSavedView(role, actor.id, view.createdById),
    canEdit: !isProjectReadOnly(writeMode) && canProjectAction(role, "update", "saved_view"),
  };
}

export async function lockSavedView(tx: ViewTransaction, id: string) {
  await tx.$queryRaw`SELECT id FROM saved_views WHERE id=${id} FOR SHARE`;
}
