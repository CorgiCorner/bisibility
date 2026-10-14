import { MatchScopeCard } from "@/components/settings/tracking/MatchScopeCard";
import {
  type PreviewTrackingCron,
  TrackingDefaultsCard,
  type UpdateTrackingDefaults,
} from "@/components/settings/tracking/TrackingDefaultsCard";
import { trackingCardGeometryClassNames } from "@/components/settings/tracking/tracking-settings-layout";
import type { CronPreviewResult } from "@/lib/actions/settings-cron-preview";
import type { DefaultsData } from "@/lib/settings/options";
import type { PreviewDefaults } from "./use-reviewed-defaults";

type TrackingSettingsContentProps = {
  canEdit: boolean;
  defaults: DefaultsData;
  domain: string | null;
  initialCronPreview: CronPreviewResult;
  previewCron: PreviewTrackingCron;
  previewDefaults: PreviewDefaults;
  projectId: string;
  updateDefaults: UpdateTrackingDefaults;
};

export function TrackingSettingsContent({
  canEdit,
  defaults,
  domain,
  initialCronPreview,
  previewCron,
  previewDefaults,
  projectId,
  updateDefaults,
}: Readonly<TrackingSettingsContentProps>) {
  return (
    <div className="max-w-[760px] space-y-5" data-tracking-settings-content="">
      <div data-tracking-settled-frame="checkDefaults" id="check-defaults" tabIndex={-1}>
        <TrackingDefaultsCard
          canEdit={canEdit}
          defaults={defaults}
          domain={domain}
          initialCronPreview={initialCronPreview}
          previewCron={previewCron}
          previewDefaults={previewDefaults}
          projectId={projectId}
          updateDefaults={updateDefaults}
        />
      </div>
      <div
        className={trackingCardGeometryClassNames.matchScope}
        data-tracking-settled-frame="matchScope"
      >
        <div className="scroll-mt-6" id="match-scope" tabIndex={-1}>
          <MatchScopeCard domain={domain} />
        </div>
      </div>
    </div>
  );
}
