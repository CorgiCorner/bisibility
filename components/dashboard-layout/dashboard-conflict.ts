import type { DashboardSurfacePreference } from "@/lib/project-surface-preferences/dashboard-model";

export function canReviewDashboardPreference(
  current: DashboardSurfacePreference | null,
  projectId: string,
  expectedRevision: number,
): current is DashboardSurfacePreference {
  return Boolean(
    current &&
      !current.notice &&
      current.projectId === projectId &&
      current.revision > expectedRevision,
  );
}
