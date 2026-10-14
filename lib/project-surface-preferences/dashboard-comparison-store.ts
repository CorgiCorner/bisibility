import "server-only";
import { writeAudit } from "@/lib/auth/audit";
import { readDashboardComparisonView } from "@/lib/dashboard-competitors/view";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { ViewDatabase } from "@/lib/saved-views/access";
import type { SavedViewContext } from "@/lib/saved-views/context";
import { SavedViewUnavailableError } from "@/lib/saved-views/errors";
import {
  hasExperimentalModule,
  normalizeExperimentalModules,
} from "@/lib/settings/experimental-modules";
import {
  dashboardPresentationSchema,
  saveDashboardComparisonSelectionSchema,
} from "./dashboard-model";
import {
  projectDashboardPreference,
  requireWritableDashboardPreference,
} from "./dashboard-read-model";
import { preferenceScope, writePreferenceCas } from "./store";

/** A remembered comparison is a personal display reference, not a default preset or paid command. */
export async function saveDashboardComparisonSelectionFor(
  input: unknown,
  context: SavedViewContext,
  db: ViewDatabase = prisma,
) {
  const data = saveDashboardComparisonSelectionSchema.parse(input);
  return db.$transaction(async (tx) => {
    const scope = await preferenceScope(tx, context, data.projectId, "update");
    const where = {
      userId_projectId_surface: {
        userId: scope.userId,
        projectId: scope.project.id,
        surface: "dashboard",
      },
    };
    const existing = requireWritableDashboardPreference(
      projectDashboardPreference(
        await tx.userProjectSurfacePreference.findUnique({ where }),
        scope.project.publicId,
      ),
    );
    if (data.selection) {
      const defaults = await tx.projectDefaults.findUnique({
        where: { projectId: scope.project.id },
        select: { enabledExperimentalModules: true },
      });
      if (
        !hasExperimentalModule(
          normalizeExperimentalModules(defaults?.enabledExperimentalModules),
          "competitors",
        )
      )
        throw new SavedViewUnavailableError();
      const view = await readDashboardComparisonView(
        tx,
        context,
        scope.project,
        data.selection,
        true,
      );
      if (
        !view ||
        !(await tx.projectMarket.findFirst({
          where: {
            projectId: scope.project.id,
            locationId: view.config.scope.locationId,
            status: "active",
          },
          select: { id: true },
        }))
      )
        throw new SavedViewUnavailableError();
    }
    const presentation = dashboardPresentationSchema.parse({
      ...existing.presentation,
      competitorSelection: data.selection,
    });
    await writePreferenceCas(tx, scope, "dashboard", data.expectedRevision, {
      presentation: presentation as Prisma.InputJsonValue,
    });
    const result = projectDashboardPreference(
      await tx.userProjectSurfacePreference.findUnique({ where }),
      scope.project.publicId,
    );
    await writeAudit(
      {
        action: "project_surface_preference.presentation",
        actorId: scope.userId,
        projectId: scope.project.id,
        targetId: scope.project.publicId,
        targetType: "project",
        after: { surface: "dashboard", operation: "select_comparison", revision: result.revision },
      },
      tx,
    );
    return result;
  });
}
