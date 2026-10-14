import "server-only";

import { type Actor, authorize, getProjectRole } from "@/lib/auth/authorize";
import { canDeleteProjectSavedView } from "@/lib/auth/capabilities";
import { prisma } from "@/lib/db/prisma";
import { isPublicIdOfType } from "@/lib/db/public-id";
import {
  savedViewAccess,
  savedViewProjectScope,
  type ViewDatabase,
  visibleSavedViews,
} from "@/lib/saved-views/access";
import {
  type CanonicalSavedViewResource,
  canonicalSavedViewSelect,
  mapCanonicalSavedViewRecord,
} from "@/lib/saved-views/canonical-model";
import {
  personalSessionUserId,
  type SavedViewContext,
  sessionSavedViewContext,
} from "@/lib/saved-views/context";
import {
  mapSavedViewRecord,
  type SavedViewResource,
  type SavedViewSurface,
} from "@/lib/saved-views/model";
import { getQueryActor, requireReadableProject, requireReadableProjectFor } from "./_auth";

type KeywordSavedView = Extract<SavedViewResource, { surface: "keywords" }>;
type CompetitorSavedView = Extract<SavedViewResource, { surface: "competitors" }>;

const savedViewSelect = {
  config: true,
  createdAt: true,
  createdById: true,
  id: true,
  name: true,
  ownerId: true,
  revision: true,
  publicId: true,
  surface: true,
  visibility: true,
} as const;

export function listSavedViews(
  projectId: string,
  surface?: "keywords",
): Promise<KeywordSavedView[]>;
export function listSavedViews(
  projectId: string,
  surface: "competitors",
): Promise<CompetitorSavedView[]>;
export async function listSavedViews(
  projectId: string,
  surface: SavedViewSurface = "keywords",
): Promise<SavedViewResource[]> {
  return readSavedViews(await requireReadableProject(projectId), surface);
}

export async function listSavedViewsFor(
  actor: Actor,
  projectId: string,
  surface: SavedViewSurface,
) {
  return readSavedViews(await requireReadableProjectFor(actor, projectId), surface);
}

async function readSavedViews(
  { actor, project }: Awaited<ReturnType<typeof requireReadableProject>>,
  surface: SavedViewSurface,
): Promise<SavedViewResource[]> {
  const views = await prisma.savedView.findMany({
    orderBy: [{ name: "asc" }, { createdAt: "asc" }],
    select: savedViewSelect,
    where: { projectId: project.id, surface, visibility: "project" },
  });
  const role = getProjectRole(actor, project.id);
  return views.flatMap(
    (view) =>
      mapSavedViewRecord(view, canDeleteProjectSavedView(role, actor.id, view.createdById)) ?? [],
  );
}

export function getSavedView(
  projectId: string,
  viewId: string | null | undefined,
  surface?: "keywords",
): Promise<KeywordSavedView | null>;
export function getSavedView(
  projectId: string,
  viewId: string | null | undefined,
  surface: "competitors",
): Promise<CompetitorSavedView | null>;
export async function getSavedView(
  projectId: string,
  viewId: string | null | undefined,
  surface: SavedViewSurface = "keywords",
): Promise<SavedViewResource | null> {
  if (!viewId || !isPublicIdOfType(viewId, "viw")) return null;
  const { actor, project } = await requireReadableProject(projectId);
  const view = await prisma.savedView.findFirst({
    select: savedViewSelect,
    where: { projectId: project.id, publicId: viewId, surface, visibility: "project" },
  });
  return view
    ? mapSavedViewRecord(
        view,
        canDeleteProjectSavedView(getProjectRole(actor, project.id), actor.id, view.createdById),
      )
    : null;
}

/** Canonical personal resources are deliberately unavailable to project API/PAT contexts. */
export async function listSessionSavedViewsFor(
  context: SavedViewContext,
  projectId: string,
  surface: SavedViewSurface,
  db: ViewDatabase = prisma,
): Promise<CanonicalSavedViewResource[]> {
  const userId = personalSessionUserId(context);
  return db.$transaction(async (tx) => {
    const { actor, project } = await savedViewProjectScope(tx, context, projectId);
    authorize(actor, "read", {
      ownerId: userId,
      projectId: project.id,
      type: "personal_saved_view",
    });
    const views = await tx.savedView.findMany({
      orderBy: [{ name: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      select: canonicalSavedViewSelect,
      where: { ...visibleSavedViews(project.id, context), surface },
    });
    return views.flatMap((view) => {
      if (view.visibility === "private" && view.ownerId !== userId) return [];
      const mapped = mapCanonicalSavedViewRecord(view, {
        ...savedViewAccess(actor, project.id, view, project.writeMode),
        projectId: project.publicId,
      });
      return mapped ? [mapped] : [];
    });
  });
}

export async function getSessionSavedViewFor(
  context: SavedViewContext,
  projectId: string,
  viewId: string,
  surface: SavedViewSurface,
  db: ViewDatabase = prisma,
): Promise<CanonicalSavedViewResource | null> {
  const userId = personalSessionUserId(context);
  if (!isPublicIdOfType(viewId, "viw")) return null;
  return db.$transaction(async (tx) => {
    const { actor, project } = await savedViewProjectScope(tx, context, projectId);
    authorize(actor, "read", {
      ownerId: userId,
      projectId: project.id,
      type: "personal_saved_view",
    });
    const view = await tx.savedView.findFirst({
      select: canonicalSavedViewSelect,
      where: { ...visibleSavedViews(project.id, context), publicId: viewId, surface },
    });
    if (!view || (view.visibility === "private" && view.ownerId !== userId)) return null;
    return mapCanonicalSavedViewRecord(view, {
      ...savedViewAccess(actor, project.id, view, project.writeMode),
      projectId: project.publicId,
    });
  });
}

export async function listSessionSavedViews(projectId: string, surface: SavedViewSurface) {
  return listSessionSavedViewsFor(
    sessionSavedViewContext(await getQueryActor()),
    projectId,
    surface,
  );
}

export async function getSessionSavedView(
  projectId: string,
  viewId: string,
  surface: SavedViewSurface,
) {
  return getSessionSavedViewFor(
    sessionSavedViewContext(await getQueryActor()),
    projectId,
    viewId,
    surface,
  );
}
