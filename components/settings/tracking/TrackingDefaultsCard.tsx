"use client";

import { useSharedErrorMessages } from "@/components/i18n/useSharedErrorMessages";
import { SettingsCard } from "@/components/settings/shell/SettingsCard";
import { TrackingCheckFields } from "@/components/settings/tracking/TrackingCheckFields";
import { TrackingScheduleFields } from "@/components/settings/tracking/TrackingScheduleFields";
import {
  type TrackingDefaultsForm,
  trackingFormDefaults,
} from "@/components/settings/tracking/tracking-form";
import { trackingCardGeometryClassNames } from "@/components/settings/tracking/tracking-settings-layout";
import { StatusChip } from "@/components/ui/StatusChip";
import type { CronPreviewResult } from "@/lib/actions/settings-cron-preview";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { projectDefaultsSchema } from "@/lib/schemas/project";
import type { DefaultsData } from "@/lib/settings/options";
import { presentActionError } from "@/lib/ui/action-error";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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
  const sharedErrors = useSharedErrorMessages();
  const t = useTranslations("projectSettingsTracking.checkDefaults");
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
        setPreview({ message: "invalid_expression", runs: [], status: "invalid", timezone: null });
      }
    });
  }

  if (!canEdit) {
    const frequencyLabels = {
      custom_cron: t("frequencyCustomCron"),
      daily: t("frequencyDaily"),
      manual: t("frequencyManual"),
      monthly: t("frequencyMonthly"),
      paused: t("frequencyPaused"),
      weekly: t("frequencyWeekly"),
    };
    const deviceLabel = defaults.device === "Mobile" ? t("deviceMobile") : t("deviceDesktop");
    return (
      <SettingsCard
        action={<StatusChip label={t("readOnly")} tone="neutral" />}
        className={trackingCardGeometryClassNames.checkDefaults}
        description={t("description")}
        showSave={false}
        title={t("title")}
      >
        <dl className="m-0 grid grid-cols-1 gap-3 text-[13px]">
          <div>
            <dt className="font-sans tabular-nums text-[10px] uppercase tracking-[0.5px] text-fg-muted">
              {t("frequency")}
            </dt>
            <dd className="m-0 mt-1 font-medium text-fg">
              {frequencyLabels[defaults.schedule.frequency]}
            </dd>
          </div>
          <div>
            <dt className="font-sans tabular-nums text-[10px] uppercase tracking-[0.5px] text-fg-muted">
              {t("timezone")}
            </dt>
            <dd className="m-0 mt-1 font-medium text-fg">{defaults.schedule.timezone}</dd>
          </div>
          <div>
            <dt className="font-sans tabular-nums text-[10px] uppercase tracking-[0.5px] text-fg-muted">
              {t("depth")}
            </dt>
            <dd className="m-0 mt-1 font-medium text-fg">
              {t("depthValue", { depth: defaults.serpDepth ?? 100 })}
            </dd>
          </div>
          <div>
            <dt className="font-sans tabular-nums text-[10px] uppercase tracking-[0.5px] text-fg-muted">
              {t("device")}
            </dt>
            <dd className="m-0 mt-1 font-medium text-fg">{deviceLabel}</dd>
          </div>
        </dl>
      </SettingsCard>
    );
  }

  async function saveDefaults() {
    if (!canEdit || !(await form.trigger())) {
      throw new Error(t("saveValidation"));
    }
    const values = form.getValues();
    setSaveError(null);
    try {
      await updateDefaults(values);
      form.reset(values);
      router.refresh();
    } catch (error: unknown) {
      setSaveError(presentActionError(error, sharedErrors, t("saveError")));
      throw error;
    }
  }

  return (
    <SettingsCard
      className={trackingCardGeometryClassNames.checkDefaults}
      description={t("description")}
      onSave={saveDefaults}
      title={t("title")}
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
                  setPreview({ message: null, runs: [], status: "idle", timezone: null });
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
