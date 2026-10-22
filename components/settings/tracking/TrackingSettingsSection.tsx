import { TrackingSettingsContent } from "@/components/settings/tracking/TrackingSettingsContent";
import { previewDefaultSettings } from "@/lib/actions/defaults-reviewed";
import { updateDefaultRankCheckSettings } from "@/lib/actions/settings";
import type { DefaultsData } from "@/lib/settings/options";

type TrackingSettingsSectionProps = {
  canEdit: boolean;
  defaults: DefaultsData;
  domain: string | null;
  projectId: string;
};

export async function TrackingSettingsSection({
  canEdit,
  defaults,
  domain,
  projectId,
}: Readonly<TrackingSettingsSectionProps>) {
  return (
    <TrackingSettingsContent
      canEdit={canEdit}
      defaults={defaults}
      domain={domain}
      previewDefaults={previewDefaultSettings}
      projectId={projectId}
      updateDefaults={updateDefaultRankCheckSettings}
    />
  );
}
