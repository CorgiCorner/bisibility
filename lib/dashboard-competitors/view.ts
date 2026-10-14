import "server-only";
import { savedViewNameSchema } from "@/lib/keywords/saved-view-model";
import { lockSavedView, type ViewTransaction, visibleSavedViews } from "@/lib/saved-views/access";
import {
  canonicalSavedViewSelect,
  mapCanonicalSavedViewRecord,
} from "@/lib/saved-views/canonical-model";
import { personalSessionUserId, type SavedViewContext } from "@/lib/saved-views/context";
import type { DashboardComparisonSelection } from "./selection";

export function comparisonViewWhere(context: SavedViewContext, projectId: string) {
  personalSessionUserId(context);
  return { ...visibleSavedViews(projectId, context), surface: "competitors" };
}
export const comparisonViewSelect = { ...canonicalSavedViewSelect, projectId: true } as const;
export function mapDashboardComparisonView(
  row: Parameters<typeof mapCanonicalSavedViewRecord>[0] & { projectId: string },
  context: SavedViewContext,
  project: { id: string; publicId: string },
) {
  if (
    row.projectId !== project.id ||
    (row.visibility === "private" && row.ownerId !== personalSessionUserId(context))
  )
    return null;
  if (!savedViewNameSchema.safeParse({ name: row.name }).success) return null;
  const view = mapCanonicalSavedViewRecord(row, {
    projectId: project.publicId,
    canEdit: false,
    canDelete: false,
  });
  return view?.surface === "competitors" ? view : null;
}
export async function readDashboardComparisonView(
  tx: ViewTransaction,
  context: SavedViewContext,
  project: { id: string; publicId: string },
  selection: DashboardComparisonSelection,
  lock = false,
) {
  const where = { ...comparisonViewWhere(context, project.id), publicId: selection.viewId };
  if (lock) {
    const reference = await tx.savedView.findFirst({ where, select: { id: true } });
    if (!reference) return null;
    await lockSavedView(tx, reference.id);
  }
  const row = await tx.savedView.findFirst({ where, select: comparisonViewSelect });
  const view = row ? mapDashboardComparisonView(row, context, project) : null;
  return view?.revision === selection.revision ? view : null;
}
