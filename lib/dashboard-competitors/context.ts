import "server-only";
import { AuthorizationError } from "@/lib/auth/authorize";
import { prisma } from "@/lib/db/prisma";
import { definitionProjectScope } from "@/lib/measurement-definitions/access";
import { type OverviewFilters, overviewComparisonDays } from "@/lib/queries/overview-filters";
import { createSessionRankTrackerReportOptions } from "@/lib/queries/rank-tracker-session-report";
import {
  RankReportCapacityError,
  RankReportSnapshotConflictError,
} from "@/lib/rank-reports/errors";
import { RANK_REPORT_HOST_LIMITS } from "@/lib/rank-reports/host-policy";
import type { ViewDatabase } from "@/lib/saved-views/access";
import { personalSessionUserId, type SavedViewContext } from "@/lib/saved-views/context";
import {
  hasExperimentalModule,
  normalizeExperimentalModules,
} from "@/lib/settings/experimental-modules";
import type { DashboardComparisonContext } from "./model";
import { readDashboardComparison } from "./read";
import { type ExplicitDashboardScope, resolveDashboardComparisonScope } from "./scope";
import {
  type DashboardComparisonSelection,
  dashboardComparisonSelectionSchema,
  effectiveDashboardComparisonSelection,
} from "./selection";
import {
  comparisonViewSelect,
  comparisonViewWhere,
  mapDashboardComparisonView,
  readDashboardComparisonView,
} from "./view";

export async function loadDashboardComparisonContext(
  projectId: string,
  context: SavedViewContext,
  input: {
    explicit?: string | string[];
    retained?: DashboardComparisonSelection | null;
    filters: OverviewFilters;
    scopeParams: ExplicitDashboardScope;
    asOf: Date;
  },
  db: ViewDatabase = prisma,
): Promise<DashboardComparisonContext> {
  const userId = personalSessionUserId(context);
  const options = await createSessionRankTrackerReportOptions(
    input.asOf,
    overviewComparisonDays(input.filters.range),
  );
  if (options.context?.actor.id !== userId || options.context.transport !== "session")
    throw new AuthorizationError("forbidden");
  const resolved = effectiveDashboardComparisonSelection(input.explicit, input.retained);
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      const authority = await definitionProjectScope(
        tx,
        { actor: { id: userId } },
        projectId,
        "read",
        "saved_view",
      );
      const project = await tx.project.findUniqueOrThrow({
        where: { id: authority.id },
        select: { id: true, publicId: true, domain: true },
      });
      const result: DashboardComparisonContext = {
        state: "missing",
        choices: [],
        selection: null,
        report: null,
      };
      try {
        const defaults = await tx.projectDefaults.findUnique({
          where: { projectId: project.id },
          select: { enabledExperimentalModules: true },
        });
        if (
          !hasExperimentalModule(
            normalizeExperimentalModules(defaults?.enabledExperimentalModules),
            "competitors",
          )
        )
          return { ...result, state: "unavailable" };
        const rows = await tx.savedView.findMany({
          where: comparisonViewWhere(context, project.id),
          select: comparisonViewSelect,
          orderBy: [{ name: "asc" }, { publicId: "asc" }],
          take: RANK_REPORT_HOST_LIMITS.maxTargets + 1,
        });
        if (rows.length > RANK_REPORT_HOST_LIMITS.maxTargets) throw new RankReportCapacityError();
        const locations = await tx.projectMarket.findMany({
          where: { projectId: project.id, status: "active" },
          select: {
            locationId: true,
            location: { select: { displayName: true, languageLabel: true } },
          },
          take: RANK_REPORT_HOST_LIMITS.maxTargets + 1,
        });
        if (locations.length > RANK_REPORT_HOST_LIMITS.maxTargets)
          throw new RankReportCapacityError();
        result.choices = rows.flatMap((row) => {
          const view = mapDashboardComparisonView(row, context, project);
          const location = view
            ? locations.find((location) => location.locationId === view.config.scope.locationId)
                ?.location
            : null;
          return view && location
            ? [
                {
                  selection: dashboardComparisonSelectionSchema.parse({
                    viewId: view.id,
                    revision: view.revision,
                  }),
                  name: view.name,
                  scope: view.config.scope,
                  tag: view.config.filters.tag,
                  locationLabel: location.displayName,
                  languageLabel: location.languageLabel,
                },
              ]
            : [];
        });
        if (resolved.state !== "selected") return { ...result, state: resolved.state };
        const view = await readDashboardComparisonView(tx, context, project, resolved.selection);
        if (!view) return { ...result, state: "unavailable" };
        const filters = resolveDashboardComparisonScope(
          view.config,
          input.filters,
          input.scopeParams,
        );
        if (!filters) return { ...result, state: "unavailable" };
        const report = await readDashboardComparison(
          tx,
          { id: userId },
          project,
          resolved.selection,
          view.config,
          filters,
          options,
        );
        return report
          ? { ...result, state: "ready", selection: resolved.selection, report }
          : { ...result, state: "unavailable" };
      } catch (failure) {
        if (failure instanceof RankReportSnapshotConflictError)
          return { ...result, state: "unavailable" };
        if (failure instanceof RankReportCapacityError) return { ...result, state: "capacity" };
        throw failure;
      }
    },
    { isolationLevel: "RepeatableRead" },
  );
}
