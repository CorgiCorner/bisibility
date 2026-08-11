import { TrackingSettingsContent } from "@/components/settings/tracking/TrackingSettingsContent";
import { updateDefaultRankCheckSettings } from "@/lib/actions/settings";
import {
  type CronPreviewResult,
  previewProjectCronRuns,
} from "@/lib/actions/settings-cron-preview";
import type { DefaultsData } from "@/lib/settings/options";

type TrackingSettingsSectionProps = {
  canEdit: boolean;
  defaults: DefaultsData;
  domain: string | null;
  projectId: string;
};

const idlePreview: CronPreviewResult = { message: "", runs: [], status: "idle" };

export async function TrackingSettingsSection({
  canEdit,
  defaults,
  domain,
  projectId,
}: Readonly<TrackingSettingsSectionProps>) {
  const cronExpression = defaults.schedule.cron_expression;
  const initialCronPreview =
    defaults.schedule.frequency === "custom_cron" && cronExpression
      ? await previewProjectCronRuns({
          cronExpression,
          projectId,
          timezone: defaults.schedule.timezone,
        })
      : idlePreview;

  return (
    <TrackingSettingsContent
      canEdit={canEdit}
      defaults={defaults}
      domain={domain}
      initialCronPreview={initialCronPreview}
      previewCron={previewProjectCronRuns}
      projectId={projectId}
      updateDefaults={updateDefaultRankCheckSettings}
    />
  );
}
