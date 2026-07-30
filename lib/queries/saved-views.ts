import "server-only";

import { getProjectRole } from "@/lib/auth/authorize";
import { canDeleteProjectSavedView } from "@/lib/auth/capabilities";
import { prisma } from "@/lib/db/prisma";
import { isPublicIdOfType } from "@/lib/db/public-id";
import type { KeywordSavedView } from "@/lib/keywords/saved-view-model";
import {
  type CompetitorSavedView,
  mapSavedViewRecord,
  type SavedViewResource,
  type SavedViewSurface,
} from "@/lib/saved-views/model";
import { requireReadableProject } from "./_auth";

const savedViewSelect = {
  config: true,
  createdAt: true,
  createdById: true,
  id: true,
  name: true,
  publicId: true,
  surface: true,
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
  const { actor, project } = await requireReadableProject(projectId);
  const views = await prisma.savedView.findMany({
    orderBy: [{ name: "asc" }, { createdAt: "asc" }],
    select: savedViewSelect,
    where: { projectId: project.id, surface },
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
    where: { projectId: project.id, publicId: viewId, surface },
  });
  return view
    ? mapSavedViewRecord(
        view,
        canDeleteProjectSavedView(getProjectRole(actor, project.id), actor.id, view.createdById),
      )
    : null;
}
