import { locationValuesForKeys } from "@/components/onboarding/onboarding-location-field";
import type { ProjectDefaultsInput } from "@/lib/schemas/project";
import type { useTranslations } from "next-intl";
import type { OnboardingTrackingDefaultsInput } from "./step-schedule-model";

export function selectedDevices(
  defaults: ProjectDefaultsInput | OnboardingTrackingDefaultsInput | undefined,
) {
  if (defaults && "devices" in defaults && defaults.devices.length > 0) return defaults.devices;
  return [defaults?.device ?? "desktop"];
}
export function selectedMarkets(
  defaults: ProjectDefaultsInput | OnboardingTrackingDefaultsInput | undefined,
) {
  if (defaults && "locations" in defaults) {
    return defaults.locationSelections ?? locationValuesForKeys(defaults.locations);
  }
  return locationValuesForKeys([defaults?.locationKey ?? "US"]);
}
export const isPausedFrequency = (frequency: ProjectDefaultsInput["frequency"] | undefined) =>
  frequency === "manual" || frequency === "paused";
export function localizedFrequency(
  t: ReturnType<typeof useTranslations<"onboarding.firstCheck">>,
  frequency: ProjectDefaultsInput["frequency"],
) {
  switch (frequency) {
    case "custom_cron":
      return t("frequency.customCron");
    case "daily":
      return t("frequency.daily");
    case "manual":
      return t("frequency.manual");
    case "monthly":
      return t("frequency.monthly");
    case "paused":
      return t("frequency.paused");
    case "weekly":
      return t("frequency.weekly");
  }
}
