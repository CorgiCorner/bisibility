import { onboardingDefaults } from "@/components/onboarding/onboarding-fixtures";
import { DEFAULT_SERP_DEVICE } from "@/lib/serp/markets";
import type { KeywordSetupForm } from "./keyword-setup-model";
import type { AddKeywordsForm } from "./step-add-keywords-model";
import type { TrackingDefaultsForm } from "./step-schedule-model";

export function keywordSetupDefaults(
  scheduleDefaults: TrackingDefaultsForm,
  defaultValues?: AddKeywordsForm,
): KeywordSetupForm {
  return {
    ...scheduleDefaults,
    device: defaultValues?.device ?? scheduleDefaults.devices[0] ?? DEFAULT_SERP_DEVICE,
    devices: defaultValues?.devices ?? scheduleDefaults.devices,
    keywords: defaultValues?.keywords ?? onboardingDefaults.addKeywords,
    locations: defaultValues?.locations ?? scheduleDefaults.locations,
    projectId: defaultValues?.projectId ?? scheduleDefaults.projectId,
  };
}

export function focusFirstKeywordSetupError(errors: { keywords?: unknown; locations?: unknown }) {
  if (errors.locations) {
    document.getElementById("onboarding-markets")?.focus();
    return;
  }
  document.querySelector<HTMLTextAreaElement>('textarea[name="keywords"]')?.focus();
}
