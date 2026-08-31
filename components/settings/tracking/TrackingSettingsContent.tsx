import { MatchScopeCard } from "@/components/settings/tracking/MatchScopeCard";
import { SearchDataSyncCard } from "@/components/settings/tracking/SearchDataSyncCard";
import {
  type PreviewTrackingCron,
  TrackingDefaultsCard,
  type UpdateTrackingDefaults,
} from "@/components/settings/tracking/TrackingDefaultsCard";
import { trackingCardGeometryClassNames } from "@/components/settings/tracking/tracking-settings-layout";
import { UrlInspectionCard } from "@/components/settings/tracking/UrlInspectionCard";
import type { CronPreviewResult } from "@/lib/actions/settings-cron-preview";
import type { DefaultsData } from "@/lib/settings/options";

type TrackingSettingsContentProps = {
  canEdit: boolean;
  defaults: DefaultsData;
  domain: string | null;
  initialCronPreview: CronPreviewResult;
  previewCron: PreviewTrackingCron;
  projectId: string;
  updateDefaults: UpdateTrackingDefaults;
};

export function TrackingSettingsContent({
  canEdit,
  defaults,
  domain,
  initialCronPreview,
  previewCron,
  projectId,
  updateDefaults,
}: Readonly<TrackingSettingsContentProps>) {
  const searchSync = defaults.searchSync ?? {
    connectionStatus: "not_connected" as const,
    lastQuotaPausedAt: null,
    pace: "normal" as const,
    lastActivityAt: null,
    pauseStartedAt: null,
    pausedReason: null,
    safeError: null,
    state: null,
    plannedRemaining: 0,
    requestsToday: 0,
    retentionMonths: 16 as const,
  };
  return (
    <div className="max-w-[760px] space-y-5" data-tracking-settings-content="">
      <div data-tracking-settled-frame="checkDefaults">
        <TrackingDefaultsCard
          canEdit={canEdit}
          defaults={defaults}
          domain={domain}
          initialCronPreview={initialCronPreview}
          previewCron={previewCron}
          projectId={projectId}
          updateDefaults={updateDefaults}
        />
      </div>
      <div
        className={trackingCardGeometryClassNames.matchScope}
        data-tracking-settled-frame="matchScope"
      >
        <MatchScopeCard domain={domain} />
      </div>
      <div className="grid gap-5" data-tracking-provider-budgets="">
        <div data-tracking-settled-frame="urlInspection">
          <UrlInspectionCard
            canEdit={canEdit}
            dailyLimit={defaults.inspectionDailyLimit}
            projectId={projectId}
          />
        </div>
        <div data-tracking-settled-frame="searchDataSync">
          <SearchDataSyncCard
            canEdit={canEdit}
            metrics={searchSync}
            pace={searchSync.pace}
            projectId={projectId}
            retentionMonths={searchSync.retentionMonths}
          />
        </div>
      </div>
    </div>
  );
}
