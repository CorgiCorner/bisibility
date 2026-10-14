import "server-only";

import { writeAudit } from "@/lib/auth/audit";
import type { Prisma } from "@/lib/generated/prisma/client";
import {
  authorizeViewWrite,
  savedViewAccess,
  type ViewScope,
  type ViewTransaction,
  visibleSavedViews,
} from "./access";
import {
  type CanonicalSavedViewRecord,
  canonicalSavedViewSelect,
  MAX_VIEW_REVISION,
  mapCanonicalSavedViewRecord,
} from "./canonical-model";
import type { ProjectViewConfig } from "./config-model";
import type { SavedViewContext } from "./context";
import { SavedViewConflictError, SavedViewUnavailableError } from "./errors";

export function canonicalResource(view: CanonicalSavedViewRecord, scope: ViewScope) {
  const resource = mapCanonicalSavedViewRecord(view, {
    ...savedViewAccess(scope.actor, scope.project.id, view, scope.project.writeMode),
    projectId: scope.project.publicId,
  });
  if (!resource) throw new SavedViewUnavailableError();
  return resource;
}

export async function auditViewMutation(
  tx: ViewTransaction,
  scope: ViewScope,
  context: SavedViewContext,
  operation: "create" | "update" | "delete",
  view: CanonicalSavedViewRecord,
) {
  const metadata = {
    revision: view.revision,
    savedViewId: view.publicId,
    surface: view.surface,
    visibility: view.visibility,
  };
  await writeAudit(
    {
      action: `saved_view.${operation}`,
      actorId: context.auditActorId,
      ...(operation === "delete" ? { before: metadata } : { after: metadata }),
      projectId: scope.project.id,
      targetId: view.publicId,
      targetType: "saved_view",
    },
    tx,
  );
}

export async function updateViewInTransaction(
  tx: ViewTransaction,
  scope: ViewScope,
  context: SavedViewContext,
  input: { config: ProjectViewConfig; expectedRevision: number; name: string; viewId: string },
) {
  const where = { ...visibleSavedViews(scope.project.id, context), publicId: input.viewId };
  const current = await tx.savedView.findFirst({ select: canonicalSavedViewSelect, where });
  if (!current) throw new SavedViewUnavailableError();
  authorizeViewWrite(scope, context, "update", current);
  if (current.surface !== input.config.surface) throw new SavedViewUnavailableError();
  if (current.revision >= MAX_VIEW_REVISION)
    throw new SavedViewConflictError(
      "This view reached its revision limit. Save a copy to continue.",
    );
  const updated = await tx.savedView.updateMany({
    data: {
      config: input.config as Prisma.InputJsonValue,
      name: input.name,
      revision: { increment: 1 },
    },
    where: { ...where, id: current.id, revision: input.expectedRevision },
  });
  if (updated.count !== 1) throw new SavedViewConflictError();
  const view = await tx.savedView.findUniqueOrThrow({
    select: canonicalSavedViewSelect,
    where: { id: current.id },
  });
  await auditViewMutation(tx, scope, context, "update", view);
  return canonicalResource(view, scope);
}

export async function deleteViewInTransaction(
  tx: ViewTransaction,
  scope: ViewScope,
  context: SavedViewContext,
  viewId: string,
  expectedRevision?: number,
) {
  const where = { ...visibleSavedViews(scope.project.id, context), publicId: viewId };
  const view = await tx.savedView.findFirst({ select: canonicalSavedViewSelect, where });
  if (!view) {
    if (expectedRevision !== undefined) throw new SavedViewUnavailableError();
    return { deleted: false };
  }
  authorizeViewWrite(scope, context, "delete", view);
  const deleted = await tx.savedView.deleteMany({
    where: { ...where, id: view.id, revision: expectedRevision ?? view.revision },
  });
  if (deleted.count !== 1) throw new SavedViewConflictError();
  await auditViewMutation(tx, scope, context, "delete", view);
  return { deleted: true };
}
