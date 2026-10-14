import "server-only";

import { authorize } from "@/lib/auth/authorize";
import { prisma } from "@/lib/db/prisma";
import { requirePublicId } from "@/lib/db/public-id";
import type { Prisma } from "@/lib/generated/prisma/client";
import {
  lockSavedView,
  savedViewProjectScope,
  type ViewDatabase,
  type ViewTransaction,
  visibleSavedViews,
} from "@/lib/saved-views/access";
import { canonicalSavedViewSelect, MAX_VIEW_REVISION } from "@/lib/saved-views/canonical-model";
import { normalizeStoredViewConfig } from "@/lib/saved-views/config-model";
import { personalSessionUserId, type SavedViewContext } from "@/lib/saved-views/context";
import { SavedViewUnavailableError, ViewPreferenceConflictError } from "@/lib/saved-views/errors";
import { tablePresentationSchema } from "@/lib/saved-views/presentation-model";
import {
  generalPreference,
  type PreferenceSurface,
  type TablePreferenceSurface,
  tablePreferenceSurfaceSchema,
  type UserProjectSurfacePreference,
} from "./model";

export async function preferenceScope(
  tx: ViewTransaction,
  context: SavedViewContext,
  projectId: string,
  action: "read" | "update",
) {
  const userId = personalSessionUserId(context);
  const scope = await savedViewProjectScope(tx, context, projectId);
  authorize(scope.actor, action, {
    ownerId: userId,
    projectId: scope.project.id,
    type: "project_surface_preference",
  });
  return { ...scope, userId };
}

export async function readPreference(
  tx: ViewTransaction,
  context: SavedViewContext,
  scope: Awaited<ReturnType<typeof preferenceScope>>,
  surface: TablePreferenceSurface,
): Promise<UserProjectSurfacePreference> {
  tablePreferenceSurfaceSchema.parse(surface);
  const row = await tx.userProjectSurfacePreference.findUnique({
    where: {
      userId_projectId_surface: { projectId: scope.project.id, surface, userId: scope.userId },
    },
  });
  const result = generalPreference(scope.project.publicId, surface);
  if (!row) return result;
  if (row.schemaVersion !== 1 || row.revision < 1)
    throw new Error("Display preference version is unavailable.");
  result.revision = row.revision;
  if (row.presentation !== null) {
    const presentation = tablePresentationSchema.safeParse(row.presentation);
    if (!presentation.success) throw new Error("Display preference presentation is unavailable.");
    result.presentation = presentation.data;
  }
  if (!row.defaultSavedViewId && !row.defaultSavedViewPublicId && row.defaultPresetId === "general")
    return result;
  if (row.defaultSavedViewId) {
    const view = await tx.savedView.findFirst({
      select: canonicalSavedViewSelect,
      where: {
        ...visibleSavedViews(scope.project.id, context),
        id: row.defaultSavedViewId,
        publicId: row.defaultSavedViewPublicId ?? undefined,
        surface,
      },
    });
    if (view && normalizeStoredViewConfig(view.config, surface)) {
      if (view.visibility === "private")
        authorize(scope.actor, "read", {
          ownerId: scope.userId,
          projectId: scope.project.id,
          type: "personal_saved_view",
        });
      result.defaultTarget = { kind: "saved_view", viewId: requirePublicId(view.publicId, "viw") };
      return result;
    }
  }
  result.notice = "unavailable_default";
  return result;
}

export async function resolveDefaultReference(
  tx: ViewTransaction,
  context: SavedViewContext,
  scope: Awaited<ReturnType<typeof preferenceScope>>,
  surface: TablePreferenceSurface,
  viewId: string,
) {
  const where = { ...visibleSavedViews(scope.project.id, context), publicId: viewId, surface };
  const reference = await tx.savedView.findFirst({ select: { id: true }, where });
  if (!reference) throw new SavedViewUnavailableError();
  await lockSavedView(tx, reference.id);
  const view = await tx.savedView.findFirst({ select: canonicalSavedViewSelect, where });
  if (!view || !normalizeStoredViewConfig(view.config, surface))
    throw new SavedViewUnavailableError();
  if (view.visibility === "private")
    authorize(scope.actor, "read", {
      ownerId: scope.userId,
      projectId: scope.project.id,
      type: "personal_saved_view",
    });
  return { defaultSavedViewId: view.id, defaultSavedViewPublicId: view.publicId };
}

export async function writePreferenceCas(
  tx: ViewTransaction,
  scope: Awaited<ReturnType<typeof preferenceScope>>,
  surface: PreferenceSurface,
  expectedRevision: number,
  data: Prisma.UserProjectSurfacePreferenceUncheckedUpdateManyInput,
) {
  const where = { projectId: scope.project.id, surface, userId: scope.userId };
  // Also serializes the absent-row revision0 transition, without overwriting another device.
  const key = JSON.stringify(["surface-preference", scope.userId, scope.project.id, surface]);
  await tx.$queryRaw`SELECT 1 AS acquired FROM pg_advisory_xact_lock(hashtextextended(${key},0))`;
  const current = await tx.userProjectSurfacePreference.findUnique({
    where: { userId_projectId_surface: where },
    select: { revision: true },
  });
  if ((current?.revision ?? 0) !== expectedRevision) throw new ViewPreferenceConflictError();
  if (current && current.revision >= MAX_VIEW_REVISION) throw new ViewPreferenceConflictError();
  if (!current)
    await tx.userProjectSurfacePreference.create({
      data: { ...where, revision: 1, schemaVersion: 1 },
    });
  const result = await tx.userProjectSurfacePreference.updateMany({
    data: { ...data, revision: current ? { increment: 1 } : 1 },
    where: { ...where, revision: current?.revision ?? 1 },
  });
  if (result.count !== 1) throw new ViewPreferenceConflictError();
}

export async function readPersonalSurfacePreferenceFor(
  context: SavedViewContext,
  projectId: string,
  surface: PreferenceSurface,
  db: ViewDatabase = prisma,
) {
  const tableSurface = tablePreferenceSurfaceSchema.parse(surface);
  return db.$transaction(async (tx) =>
    readPreference(
      tx,
      context,
      await preferenceScope(tx, context, projectId, "read"),
      tableSurface,
    ),
  );
}
