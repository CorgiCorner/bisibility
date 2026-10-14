import "server-only";

import { createHash } from "node:crypto";
import { loadDashboardComparisonContext } from "@/lib/dashboard-competitors/context";
import type { DashboardComparisonContext } from "@/lib/dashboard-competitors/model";
import type { ExplicitDashboardScope } from "@/lib/dashboard-competitors/scope";
import { composeDashboardLayout } from "@/lib/dashboard-layout/compose";
import type { DashboardAccess } from "@/lib/dashboard-layout/types";
import { loadDashboardLocalContext } from "@/lib/dashboard-local/context";
import { prisma } from "@/lib/db/prisma";
import {
  dashboardLayoutFor,
  dashboardPresetSchema,
} from "@/lib/project-surface-preferences/dashboard-model";
import { readDashboardPreferenceFor } from "@/lib/project-surface-preferences/dashboard-store";
import { sessionSavedViewContext } from "@/lib/saved-views/context";
import { requireReadableProject } from "./_auth";
import { optionalDashboardRead } from "./dashboard-optional-read";
import { normalizeOverviewFilters, type OverviewFilters } from "./overview-filters";

export async function loadDashboardPersonalContext(
  projectRef: string,
  explicit: string | string[] | undefined,
  options: {
    localSubject?: string | string[];
    comparison?: string | string[];
    filters?: OverviewFilters;
    scopeParams?: ExplicitDashboardScope;
    asOf?: Date;
  } = {},
) {
  const { actor, project } = await requireReadableProject(projectRef);
  const preference = await readDashboardPreferenceFor(
    sessionSavedViewContext(actor),
    project.publicId,
  );
  const competitors = await optionalDashboardRead(
    () => prisma.competitor.count({ where: { projectId: project.id } }),
    () => requireReadableProject(projectRef),
  );
  const competitorCount = competitors.value;
  const parsed =
    explicit === undefined
      ? null
      : dashboardPresetSchema.safeParse(Array.isArray(explicit) ? explicit[0] : explicit);
  const invalidPreset =
    (parsed !== null && !parsed.success) ||
    (parsed === null && preference.notice?.scopeUnavailable === true);
  const resolved = dashboardLayoutFor(preference, parsed?.success ? parsed.data : undefined);
  const layout = preference.presentation.layouts[resolved.preset]
    ? resolved
    : {
        ...resolved,
        widgets: resolved.widgets.map((widget) =>
          widget.id === "competitor_comparison" &&
          competitorCount === 0 &&
          resolved.preset !== "competitors"
            ? { ...widget, visible: false }
            : widget,
        ),
      };
  const local =
    layout.preset === "local" && !invalidPreset
      ? await loadDashboardLocalContext(
          project.publicId,
          { actor },
          options.localSubject,
          preference.presentation.localSelection,
          options.asOf ?? new Date(),
        )
      : null;
  const comparison: DashboardComparisonContext | null =
    layout.preset === "competitors" && !invalidPreset
      ? ((
          await optionalDashboardRead(
            () =>
              loadDashboardComparisonContext(project.publicId, sessionSavedViewContext(actor), {
                explicit: options.comparison,
                retained: preference.presentation.competitorSelection,
                filters: options.filters ?? normalizeOverviewFilters(),
                scopeParams: options.scopeParams ?? {},
                asOf: options.asOf ?? new Date(),
              }),
            () => requireReadableProject(projectRef),
          )
        ).value ?? { state: "unavailable", choices: [], selection: null, report: null })
      : null;
  const access: DashboardAccess = {
    projectId: project.publicId,
    projectReadAuthorized: true,
    competitorsReadAuthorized: true,
    capabilities: [
      "organic_reports",
      "position_history",
      "keyword_highlights",
      "connection_details",
      "market_rollup",
      "visibility_history",
      "contributions",
      "quality_history",
      ...((comparison?.state === "ready" || competitorCount !== 0) && layout.preset !== "local"
        ? ["competitor_reports" as const]
        : []),
      ...(local?.state === "ready" ? ["local_business_observations" as const] : []),
    ],
    localSubject:
      local?.state === "ready" && local.selection
        ? {
            projectId: project.publicId,
            entityId: local.selection.locationId,
            identityRevisionId: local.selection.identityRevisionId,
          }
        : null,
    competitorScope: comparison?.report
      ? { projectId: project.publicId, selectionRevisionId: comparison.report.selectionRevisionId }
      : null,
  };
  const composition = composeDashboardLayout(layout, access);
  return {
    access,
    composition,
    invalidPreset,
    preference,
    local,
    comparison,
    scopeKey: createHash("sha256")
      .update(
        JSON.stringify([
          actor.id,
          project.publicId,
          "dashboard",
          preference.revision,
          layout.preset,
          local?.selection ?? null,
          local?.state ?? null,
          comparison?.selection ?? null,
          comparison?.state ?? null,
        ]),
      )
      .digest("hex"),
  };
}
