"use client";
import { useReviewedDefaults } from "@/components/settings/tracking/use-reviewed-defaults";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { OnboardingWizardActions } from "./onboarding-wizard-actions";
import type { OnboardingTrackingDefaultsInput } from "./steps/step-schedule-model";
/** A timezone edit is future intent, never an automatic unreviewed write. */
export function useReviewedOnboardingDefaults(
  actions: OnboardingWizardActions,
  defaults: OnboardingTrackingDefaultsInput,
  stage: (timezone: string) => void,
  onPending: () => void,
  onSaved: (nextCheckAt: string | null) => void,
) {
  const [error, setError] = useState<string | null>(null);
  const t = useTranslations("projectSettingsTracking.checkDefaults");
  const reviewed = useReviewedDefaults(
    actions.previewProjectDefaultsAction,
    async (values, review) => {
      const result = await actions.updateProjectDefaultsAction(values, review);
      if (result && "kind" in result && result.kind === "saved")
        onSaved(result.nextCheckAt ?? null);
      return result;
    },
  );
  async function handleTimezoneChange(timezone: string) {
    setError(null);
    if (!reviewed.locked) stage(timezone);
    onPending();
    try {
      await reviewed.submit({ ...defaults, timezone });
    } catch {
      setError(t("saveError"));
    }
  }
  return { reviewed, error, handleTimezoneChange };
}
