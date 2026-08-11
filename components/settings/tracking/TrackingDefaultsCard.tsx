"use client";

import { SettingsCard } from "@/components/settings/shell/SettingsCard";
import { TrackingCheckFields } from "@/components/settings/tracking/TrackingCheckFields";
import { TrackingScheduleFields } from "@/components/settings/tracking/TrackingScheduleFields";
import {
  type TrackingDefaultsForm,
  trackingFormDefaults,
} from "@/components/settings/tracking/tracking-form";
import { trackingCardGeometryClassNames } from "@/components/settings/tracking/tracking-settings-layout";
import type { CronPreviewResult } from "@/lib/actions/settings-cron-preview";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { projectDefaultsSchema } from "@/lib/schemas/project";
import type { DefaultsData } from "@/lib/settings/options";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

export type UpdateTrackingDefaults = (input: TrackingDefaultsForm) => Promise<unknown>;
export type PreviewTrackingCron = (input: {
  cronExpression: string;
  projectId: string;
  timezone: string;
}) => Promise<CronPreviewResult>;

type TrackingDefaultsCardProps = {
  canEdit: boolean;
  defaults: DefaultsData;
  domain?: string | null;
  initialCronPreview: CronPreviewResult;
  previewCron: PreviewTrackingCron;
  projectId: string;
  updateDefaults: UpdateTrackingDefaults;
};

export function TrackingDefaultsCard({
  canEdit,
  defaults,
  domain = null,
  initialCronPreview,
  previewCron,
  projectId,
  updateDefaults,
}: Readonly<TrackingDefaultsCardProps>) {
  const router = useRouter();
  const [preview, setPreview] = useState(initialCronPreview);
  const [previewPending, startPreviewTransition] = useTransition();
  const [saveError, setSaveError] = useState<string | null>(null);
  const form = useForm<TrackingDefaultsForm>({
    defaultValues: trackingFormDefaults(defaults, projectId),
    mode: "onChange",
    resolver: zodResolver(projectDefaultsSchema),
  });

  function requestPreview(cronExpression: string, timezone: string) {
    startPreviewTransition(async () => {
      try {
        setPreview(await previewCron({ cronExpression, projectId, timezone }));
      } catch {
        setPreview({ message: "The next runs could not be checked.", runs: [], status: "invalid" });
      }
    });
  }

  async function saveDefaults() {
    if (!canEdit || !(await form.trigger())) {
      throw new Error("Check the highlighted settings before saving.");
    }
    const values = form.getValues();
    setSaveError(null);
    try {
      await updateDefaults(values);
      form.reset(values);
      router.refresh();
    } catch (error: unknown) {
      setSaveError(actionErrorMessage(error, "Check defaults could not be saved."));
      throw error;
    }
  }

  return (
    <SettingsCard
      className={trackingCardGeometryClassNames.checkDefaults}
      description="What every keyword is checked with, unless it has its own setting."
      onSave={saveDefaults}
      title="Check defaults"
    >
      {({ markDirty }) => (
        <form onSubmit={(event) => event.preventDefault()}>
          <fieldset className="contents" disabled={!canEdit}>
            <TrackingScheduleFields
              form={form}
              onCronBlur={() =>
                requestPreview(form.getValues("cronExpression") ?? "", form.getValues("timezone"))
              }
              onFrequencyChange={(frequency) => {
                form.setValue("frequency", frequency, { shouldDirty: true, shouldValidate: true });
                markDirty();
                if (frequency === "custom_cron") {
                  requestPreview(
                    form.getValues("cronExpression") ?? "0 6 * * *",
                    form.getValues("timezone"),
                  );
                } else {
                  setPreview({ message: "", runs: [], status: "idle" });
                }
              }}
              onTimezoneChange={(timezone) => {
                form.setValue("timezone", timezone, { shouldDirty: true, shouldValidate: true });
                markDirty();
                if (form.getValues("frequency") === "custom_cron") {
                  requestPreview(form.getValues("cronExpression") ?? "", timezone);
                }
              }}
              preview={preview}
              previewPending={previewPending}
            />
            <TrackingCheckFields
              canEdit={canEdit}
              defaults={defaults}
              domain={domain}
              form={form}
              markDirty={markDirty}
            />
          </fieldset>
          {saveError ? <p className="m-0 mt-3 text-[12px] text-red-text">{saveError}</p> : null}
        </form>
      )}
    </SettingsCard>
  );
}
