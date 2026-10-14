import { appPath } from "@/lib/routing/app-path";
import type { SavedViewSurface } from "./config-model";

/** An explicit General link keeps an empty view key so it cannot reactivate a personal default. */
export function canonicalSavedViewHref(
  projectId: string,
  surface: SavedViewSurface,
  viewId: string | null,
) {
  const params = new URLSearchParams({ view: viewId ?? "" });
  return `${appPath(projectId, surface === "keywords" ? "rank-tracker" : "competitors")}?${params}`;
}
