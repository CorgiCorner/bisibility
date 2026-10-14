import type { CanonicalSavedViewResource } from "@/lib/saved-views/canonical-model";
import type { SavedViewSurface } from "@/lib/saved-views/config-model";
import type { UserProjectSurfacePreference } from "./model";

export type ViewSelection =
  | { kind: "general"; notice: "unavailable_default" | null }
  | {
      kind: "saved_view";
      notice: null;
      source: "url" | "personal_default";
      view: CanonicalSavedViewResource;
    }
  | { kind: "unavailable_explicit_view"; notice: null };

/** Explicit empty view selects General; an unavailable explicit link never selects an all-scope query. */
export function resolvePersonalViewSelection(input: {
  explicitViewId: string | null;
  explicitViewPresent: boolean;
  preference?: UserProjectSurfacePreference | null;
  projectId: string;
  surface: SavedViewSurface;
  views: readonly CanonicalSavedViewResource[];
}): ViewSelection {
  const available = (id: string) =>
    input.views.find(
      (view) =>
        view.id === id && view.projectId === input.projectId && view.surface === input.surface,
    );
  if (input.explicitViewPresent) {
    if (!input.explicitViewId) return { kind: "general", notice: null };
    const view = available(input.explicitViewId);
    return view
      ? { kind: "saved_view", notice: null, source: "url", view }
      : { kind: "unavailable_explicit_view", notice: null };
  }
  const preference = input.preference;
  if (
    !preference ||
    preference.projectId !== input.projectId ||
    preference.surface !== input.surface
  )
    return { kind: "general", notice: null };
  if (preference.defaultTarget.kind === "saved_view") {
    const view = available(preference.defaultTarget.viewId);
    return view
      ? { kind: "saved_view", notice: null, source: "personal_default", view }
      : { kind: "general", notice: "unavailable_default" };
  }
  return { kind: "general", notice: preference.notice };
}
