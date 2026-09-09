import type { LocationFieldValue } from "@/components/keywords/LocationField";
import {
  DEFAULT_ONBOARDING_DEVICE,
  DEFAULT_ONBOARDING_FREQUENCY,
  type OnboardingFlowState,
} from "@/components/onboarding/onboarding-fixtures";
import {
  countryNameForLocationValue,
  locationValueForKey,
} from "@/components/onboarding/onboarding-location-field";
import {
  countryLocationKey,
  DEFAULT_ONBOARDING_LOCATION_KEY,
  MAX_ONBOARDING_LOCATIONS,
} from "@/components/onboarding/onboarding-locations";
import { canonicalKeySchema, deviceSchema } from "@/lib/schemas/keyword";
import { type ProjectDefaultsInput, projectDefaultsSchema } from "@/lib/schemas/project";
import { serpDepthSchema } from "@/lib/schemas/serp-depth";
import { DEFAULT_SERP_DEVICE, type SerpDepth, type SerpDevice } from "@/lib/serp/constants";
import { z } from "zod";

export const DEFAULT_ONBOARDING_SERP_DEPTH: SerpDepth = 20;

const trackingScheduleSchema = z.object({
  cronExpression: projectDefaultsSchema.shape.cronExpression,
  frequency: projectDefaultsSchema.shape.frequency,
  jitterMinutes: projectDefaultsSchema.shape.jitterMinutes,
  timezone: projectDefaultsSchema.shape.timezone,
});

export const onboardingTrackingDefaultsSchema = trackingScheduleSchema.extend({
  devices: z.array(deviceSchema).min(1),
  locations: z
    .array(canonicalKeySchema)
    .min(1, "Add at least one market to continue.")
    .max(MAX_ONBOARDING_LOCATIONS),
  projectId: z.string().trim().min(1).max(120),
  serpDepth: serpDepthSchema.default(DEFAULT_ONBOARDING_SERP_DEPTH),
});

export type TrackingDefaultsForm = z.infer<typeof onboardingTrackingDefaultsSchema>;

export type OnboardingTrackingDefaultsInput = ProjectDefaultsInput & {
  devices: SerpDevice[];
  locationSelections: LocationFieldValue[];
  locations: string[];
};

function locationKeysFromDefaults(
  values: ProjectDefaultsInput | OnboardingTrackingDefaultsInput | undefined,
  flowState?: OnboardingFlowState,
) {
  if (values && "locations" in values && values.locations.length > 0) return [...values.locations];
  if (flowState?.locations && flowState.locations.length > 0) return [...flowState.locations];
  if (values && "country" in values) {
    const key = countryLocationKey(values.country);
    return key ? [key] : [DEFAULT_ONBOARDING_LOCATION_KEY];
  }
  return [DEFAULT_ONBOARDING_LOCATION_KEY];
}

export function withTrackingDefaults(
  values: ProjectDefaultsInput | OnboardingTrackingDefaultsInput | undefined,
  flowState?: OnboardingFlowState,
): TrackingDefaultsForm {
  const locations = locationKeysFromDefaults(values, flowState);
  const devices =
    "devices" in (values ?? {})
      ? [...((values as OnboardingTrackingDefaultsInput).devices ?? [])]
      : [...(flowState?.devices ?? [values?.device ?? DEFAULT_ONBOARDING_DEVICE])];

  return {
    cronExpression: values?.cronExpression ?? "0 6 * * *",
    devices,
    frequency: values?.frequency ?? DEFAULT_ONBOARDING_FREQUENCY,
    jitterMinutes: values?.jitterMinutes ?? 60,
    locations,
    projectId: values?.projectId ?? flowState?.projectId ?? "",
    serpDepth: values?.serpDepth ?? flowState?.serpDepth ?? DEFAULT_ONBOARDING_SERP_DEPTH,
    timezone: values?.timezone ?? "UTC",
  };
}

/**
 * The markets a step starts with: the draft's stored selections carry the server's display name
 * and language, so they win; only a key without one (the default country) is rebuilt locally.
 */
export function draftLocationSelections(
  keys: readonly string[],
  selections: readonly LocationFieldValue[] | undefined,
): LocationFieldValue[] {
  return keys.map(
    (key) =>
      selections?.find((selection) => selection.canonicalKey === key) ?? locationValueForKey(key),
  );
}

export function completedTrackingDefaults(
  values: TrackingDefaultsForm,
  selectedLocations: readonly LocationFieldValue[],
): OnboardingTrackingDefaultsInput {
  const locationSelections = values.locations.map(
    (key) =>
      selectedLocations.find((location) => location.canonicalKey === key) ??
      locationValueForKey(key),
  );
  const primaryLocation =
    locationSelections[0] ?? locationValueForKey(DEFAULT_ONBOARDING_LOCATION_KEY);

  return {
    ...values,
    city: primaryLocation.kind === "city" ? primaryLocation.displayName : null,
    country: countryNameForLocationValue(primaryLocation),
    device: values.devices[0] ?? DEFAULT_SERP_DEVICE,
    locationKey: primaryLocation.canonicalKey,
    locationSelections,
  };
}
