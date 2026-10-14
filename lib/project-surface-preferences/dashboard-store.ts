import "server-only";

import { writeAudit } from "@/lib/auth/audit";
import { businessReadProjectScope } from "@/lib/business-location-store/access";
import { resolveDashboardLocalSubject } from "@/lib/dashboard-local/subject";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { ViewDatabase, ViewTransaction } from "@/lib/saved-views/access";
import type { SavedViewContext } from "@/lib/saved-views/context";
import {
  type DashboardSurfacePreference,
  dashboardPresentationSchema,
  saveDashboardLayoutSchema,
  saveDashboardLocalSelectionSchema,
  setDashboardDefaultSchema,
} from "./dashboard-model";
import {
  projectDashboardPreference,
  requireWritableDashboardPreference,
} from "./dashboard-read-model";
import { preferenceScope, writePreferenceCas } from "./store";

type Scope = Awaited<ReturnType<typeof preferenceScope>>;
async function readDashboard(
  tx: ViewTransaction,
  scope: Scope,
  writable = false,
): Promise<DashboardSurfacePreference> {
  const row = await tx.userProjectSurfacePreference.findUnique({
    where: {
      userId_projectId_surface: {
        userId: scope.userId,
        projectId: scope.project.id,
        surface: "dashboard",
      },
    },
  });
  const preference = projectDashboardPreference(row, scope.project.publicId);
  return writable ? requireWritableDashboardPreference(preference) : preference;
}
export async function readDashboardPreferenceFor(
  context: SavedViewContext,
  projectId: string,
  db: ViewDatabase = prisma,
) {
  return db.$transaction(async (tx) =>
    readDashboard(tx, await preferenceScope(tx, context, projectId, "read")),
  );
}
export async function saveDashboardLayoutFor(
  input: unknown,
  context: SavedViewContext,
  db: ViewDatabase = prisma,
) {
  const data = saveDashboardLayoutSchema.parse(input);
  return db.$transaction(async (tx) => {
    const scope = await preferenceScope(tx, context, data.projectId, "update");
    const existing = await readDashboard(tx, scope, true);
    const presentation = dashboardPresentationSchema.parse({
      ...existing.presentation,
      schemaVersion: 1,
      layouts: {
        ...existing.presentation.layouts,
        [data.layout.preset]: data.layout,
      },
    });
    await writePreferenceCas(tx, scope, "dashboard", data.expectedRevision, {
      presentation: presentation as Prisma.InputJsonValue,
    });
    const result = await readDashboard(tx, scope, true);
    await writeAudit(
      {
        action: "project_surface_preference.presentation",
        actorId: scope.userId,
        projectId: scope.project.id,
        targetId: scope.project.publicId,
        targetType: "project",
        after: { surface: "dashboard", operation: "save_layout", revision: result.revision },
      },
      tx,
    );
    return result;
  });
}
export async function setDashboardDefaultFor(
  input: unknown,
  context: SavedViewContext,
  db: ViewDatabase = prisma,
) {
  const data = setDashboardDefaultSchema.parse(input);
  return db.$transaction(async (tx) => {
    const scope = await preferenceScope(tx, context, data.projectId, "update");
    await readDashboard(tx, scope, true);
    await writePreferenceCas(tx, scope, "dashboard", data.expectedRevision, {
      defaultPresetId: data.preset,
      defaultSavedViewId: null,
      defaultSavedViewPublicId: null,
    });
    const result = await readDashboard(tx, scope, true);
    await writeAudit(
      {
        action: "project_surface_preference.set_default",
        actorId: scope.userId,
        projectId: scope.project.id,
        targetId: scope.project.publicId,
        targetType: "project",
        after: { surface: "dashboard", operation: "set_default", revision: result.revision },
      },
      tx,
    );
    return result;
  });
}

/** Personal selection write only: never changes business assignments, identity, schedules or provider state. */
export async function saveDashboardLocalSelectionFor(
  input: unknown,
  context: SavedViewContext,
  db: ViewDatabase = prisma,
) {
  const data = saveDashboardLocalSelectionSchema.parse(input);
  return db.$transaction(async (tx) => {
    const scope = await preferenceScope(tx, context, data.projectId, "update");
    const existing = await readDashboard(tx, scope, true);
    if (data.selection) {
      const businessScope = await businessReadProjectScope(
        tx,
        { actor: scope.actor },
        data.projectId,
        "business_assignment",
      );
      await resolveDashboardLocalSubject(tx, businessScope, data.selection, new Date());
    }
    const presentation = dashboardPresentationSchema.parse({
      ...existing.presentation,
      localSelection: data.selection,
    });
    await writePreferenceCas(tx, scope, "dashboard", data.expectedRevision, {
      presentation: presentation as Prisma.InputJsonValue,
    });
    const result = await readDashboard(tx, scope, true);
    await writeAudit(
      {
        action: "project_surface_preference.presentation",
        actorId: scope.userId,
        projectId: scope.project.id,
        targetId: scope.project.publicId,
        targetType: "project",
        after: {
          surface: "dashboard",
          operation: "select_local_subject",
          revision: result.revision,
        },
      },
      tx,
    );
    return result;
  });
}
