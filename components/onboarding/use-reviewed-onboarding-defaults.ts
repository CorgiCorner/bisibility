"use client";
import { useReviewedDefaults } from "@/components/settings/tracking/use-reviewed-defaults";
import type { OnboardingWizardActions } from "./onboarding-wizard-actions";
import type { OnboardingTrackingDefaultsInput } from "./steps/step-schedule-model";
/** A timezone edit is future intent, never an automatic unreviewed write. */
export function useReviewedOnboardingDefaults(
  actions: OnboardingWizardActions,
  defaults: OnboardingTrackingDefaultsInput,
  stage: (timezone: string) => void,
  onPending: () => void,
) {
  const reviewed = useReviewedDefaults(
    actions.previewProjectDefaultsAction,
    actions.updateProjectDefaultsAction,
  );
  async function handleTimezoneChange(timezone: string) {
    if (!reviewed.locked) stage(timezone);
    const result = await reviewed.submit({ ...defaults, timezone });
    if (result === "review") onPending();
  }
  return { reviewed, handleTimezoneChange };
}
