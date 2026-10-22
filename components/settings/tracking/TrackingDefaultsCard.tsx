"use client";

import { useSharedErrorMessages } from "@/components/i18n/useSharedErrorMessages";
import { SettingsCard } from "@/components/settings/shell/SettingsCard";
import { TrackingCheckFields } from "@/components/settings/tracking/TrackingCheckFields";
import {
  type TrackingDefaultsForm,
  trackingFormDefaults,
} from "@/components/settings/tracking/tracking-form";
import { trackingCardGeometryClassNames } from "@/components/settings/tracking/tracking-settings-layout";
import { StatusChip } from "@/components/ui/StatusChip";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { projectDefaultsSchema } from "@/lib/schemas/project";
import type { DefaultsData } from "@/lib/settings/options";
import { presentActionError } from "@/lib/ui/action-error";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { ReviewedDefaultsPanel } from "./ReviewedDefaultsPanel";
import { useDefaultsFormReview } from "./use-defaults-form-review";
import {
  type PreviewDefaults,
  type SaveDefaults,
  useReviewedDefaults,
} from "./use-reviewed-defaults";
export type UpdateTrackingDefaults = SaveDefaults;
type TrackingDefaultsCardProps = {
  canEdit: boolean;
  defaults: DefaultsData;
  domain?: string | null;
  previewDefaults: PreviewDefaults;
  projectId: string;
  updateDefaults: UpdateTrackingDefaults;
};

export function TrackingDefaultsCard({
  canEdit,
  defaults,
  domain = null,
  previewDefaults,
  projectId,
  updateDefaults,
}: Readonly<TrackingDefaultsCardProps>) {
  const router = useRouter();
  const sharedErrors = useSharedErrorMessages();
  const t = useTranslations("projectSettingsTracking.checkDefaults");
  const reviewed = useReviewedDefaults(previewDefaults, updateDefaults);
  const reviewT = useTranslations("shared.reviewedDefaults");
  const [saveError, setSaveError] = useState<string | null>(null);
  const form = useForm<TrackingDefaultsForm>({
    defaultValues: trackingFormDefaults(defaults, projectId),
    mode: "onChange",
    resolver: zodResolver(projectDefaultsSchema),
  });

  useDefaultsFormReview(form, reviewed.invalidate);

  if (!canEdit) {
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
      const outcome = await reviewed.submit(values);
      if (outcome === "review") throw new Error("Review pending");
      form.reset(values);
      router.refresh();
    } catch (error: unknown) {
      if (!(error instanceof Error && error.message === "Review pending"))
        setSaveError(presentActionError(error, sharedErrors, t("saveError")));
      throw error;
    }
  }

  return (
    <SettingsCard
      className={trackingCardGeometryClassNames.checkDefaults}
      description={t("description")}
      onSave={saveDefaults}
      saveLabel={
        reviewed.locked
          ? reviewT("retry")
          : reviewed.quote
            ? reviewT("confirmSave")
            : reviewT("review")
      }
      title={t("title")}
    >
      {({ markDirty }) => (
        <form onSubmit={(event) => event.preventDefault()}>
          <fieldset className="contents" disabled={!canEdit || reviewed.pending || reviewed.locked}>
            <TrackingCheckFields
              canEdit={canEdit}
              defaults={defaults}
              domain={domain}
              form={form}
              markDirty={markDirty}
            />
          </fieldset>
          <ReviewedDefaultsPanel
            quote={reviewed.quote}
            acknowledged={reviewed.acknowledged}
            onAcknowledged={reviewed.setAcknowledged}
            locked={reviewed.locked}
          />
          {saveError ? <p className="m-0 mt-3 text-[12px] text-red-text">{saveError}</p> : null}
        </form>
      )}
    </SettingsCard>
  );
}
