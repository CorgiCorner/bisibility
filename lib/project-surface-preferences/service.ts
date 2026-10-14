import "server-only";

import { parseActionInput, revalidateKeywordViews } from "@/lib/actions/_shared";
import { writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import type { ViewDatabase } from "@/lib/saved-views/access";
import type { SavedViewContext } from "@/lib/saved-views/context";
import { savePersonalPresentationSchema, setPersonalDefaultSchema } from "./model";
import {
  preferenceScope,
  readPreference,
  resolveDefaultReference,
  writePreferenceCas,
} from "./store";

export async function setPersonalDefaultFor(
  input: unknown,
  context: SavedViewContext,
  db: ViewDatabase = prisma,
) {
  const data = parseActionInput(setPersonalDefaultSchema, input);
  const result = await db.$transaction(async (tx) => {
    const scope = await preferenceScope(tx, context, data.projectId, "update");
    const reference =
      data.target.kind === "saved_view"
        ? await resolveDefaultReference(tx, context, scope, data.surface, data.target.viewId)
        : { defaultSavedViewId: null, defaultSavedViewPublicId: null };
    await writePreferenceCas(tx, scope, data.surface, data.expectedRevision, {
      ...reference,
      defaultPresetId: "general",
    });
    const preference = await readPreference(tx, context, scope, data.surface);
    await writeAudit(
      {
        action: "project_surface_preference.set_default",
        actorId: scope.userId,
        after: { operation: "set_default", revision: preference.revision, surface: data.surface },
        projectId: scope.project.id,
        targetId: scope.project.publicId,
        targetType: "project",
      },
      tx,
    );
    return preference;
  });
  revalidateKeywordViews();
  return result;
}

export async function savePersonalPresentationFor(
  input: unknown,
  context: SavedViewContext,
  db: ViewDatabase = prisma,
) {
  const data = parseActionInput(savePersonalPresentationSchema, input);
  const result = await db.$transaction(async (tx) => {
    const scope = await preferenceScope(tx, context, data.projectId, "update");
    await writePreferenceCas(tx, scope, data.surface, data.expectedRevision, {
      presentation: data.presentation === null ? Prisma.DbNull : data.presentation,
    });
    const preference = await readPreference(tx, context, scope, data.surface);
    await writeAudit(
      {
        action: "project_surface_preference.presentation",
        actorId: scope.userId,
        after: { operation: "presentation", revision: preference.revision, surface: data.surface },
        projectId: scope.project.id,
        targetId: scope.project.publicId,
        targetType: "project",
      },
      tx,
    );
    return preference;
  });
  revalidateKeywordViews();
  return result;
}
