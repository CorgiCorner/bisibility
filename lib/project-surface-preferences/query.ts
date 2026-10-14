import "server-only";

import { getQueryActor } from "@/lib/queries/_auth";
import { sessionSavedViewContext } from "@/lib/saved-views/context";
import { tablePreferenceSurfaceSchema } from "./model";
import { readPersonalSurfacePreferenceFor } from "./store";

export async function getPersonalSurfacePreference(projectId: string, surface: unknown) {
  return readPersonalSurfacePreferenceFor(
    sessionSavedViewContext(await getQueryActor()),
    projectId,
    tablePreferenceSurfaceSchema.parse(surface),
  );
}
