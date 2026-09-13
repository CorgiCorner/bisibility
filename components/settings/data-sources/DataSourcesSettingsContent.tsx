import { SearchDataSyncCard } from "@/components/settings/tracking/SearchDataSyncCard";
import { UrlInspectionCard } from "@/components/settings/tracking/UrlInspectionCard";
import type { DefaultsData } from "@/lib/settings/options";

type Props = { canEdit: boolean; defaults: DefaultsData; projectId: string };

export function DataSourcesSettingsContent({ canEdit, defaults, projectId }: Readonly<Props>) {
  const searchSync = defaults.searchSync ?? {
    connectionStatus: "not_connected" as const,
    firstDataDate: null,
    firstDataDateLabel: null,
    lastActivityAt: null,
    lastQuotaPausedAt: null,
    newestFinalizedDate: null,
    pace: "normal" as const,
    pauseStartedAt: null,
    pausedReason: null,
    plannedRemaining: 0,
    requestsToday: 0,
    retentionMonths: 16 as const,
    safeError: null,
    state: null,
  };
  return (
    <div className="max-w-[760px] space-y-5" data-data-sources-settings-content="">
      <div
        className="scroll-mt-6"
        id="url-inspection"
        tabIndex={-1}
        data-testid="url-inspection-card"
      >
        <UrlInspectionCard
          canEdit={canEdit}
          dailyLimit={defaults.inspectionDailyLimit}
          projectId={projectId}
        />
      </div>
      <div
        className="scroll-mt-6"
        id="search-data-sync"
        tabIndex={-1}
        data-testid="search-data-sync-card"
      >
        <SearchDataSyncCard
          canEdit={canEdit}
          metrics={searchSync}
          pace={searchSync.pace}
          projectId={projectId}
          retentionMonths={searchSync.retentionMonths}
        />
      </div>
      {/* Sitemap monitoring settings belong here when the app gains user-facing controls. */}
    </div>
  );
}
