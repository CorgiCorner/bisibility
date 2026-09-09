import type { LocationFieldValue } from "@/components/keywords/location-picker-data";
import {
  DEFAULT_ONBOARDING_DEVICE,
  DEFAULT_ONBOARDING_FREQUENCY,
  type OnboardingFlowState,
  onboardingDefaults,
} from "@/components/onboarding/onboarding-fixtures";
import type { AddKeywordsForm } from "@/components/onboarding/steps/StepAddKeywords";
import type { OnboardingConnectProviderInput } from "@/components/onboarding/steps/StepConnectProvider";
import type { CreateProjectFormValues } from "@/components/onboarding/steps/StepCreateProject";
import type { OnboardingTrackingDefaultsInput } from "@/components/onboarding/steps/step-schedule-model";
import { DEFAULT_SERP_DEVICE, type SerpDepth } from "@/lib/serp/constants";
// Restore ownership matching with issue #863:
// import { defaultMatchingScopeValues } from "./MatchingScopeFields";
import { countryNameForLocationValue, locationValueForKey } from "./onboarding-location-field";
import { DEFAULT_ONBOARDING_LOCATION_KEY } from "./onboarding-locations";

export type OnboardingProject = {
  domain: string | null;
  id: string;
  isSample?: boolean;
  name: string;
  publicId: string;
  device?: "desktop" | "mobile";
  frequency?: OnboardingTrackingDefaultsInput["frequency"];
  cronExpression?: string | null;
  jitterMinutes?: number;
  serpDepth?: SerpDepth;
  timezone?: string;
  trackingStartedAt?: string | null;
};

export type OnboardingDraft = {
  addKeywords: AddKeywordsForm;
  connectProvider: OnboardingConnectProviderInput;
  createProject: CreateProjectFormValues;
  schedule: OnboardingTrackingDefaultsInput;
};

export function projectIdFor(project: OnboardingProject | null, flowState: OnboardingFlowState) {
  return project?.publicId ?? flowState.projectId ?? "";
}

export function initialOnboardingDraft(
  project: OnboardingProject | null,
  flowState: OnboardingFlowState,
  initialWebsite = "",
  storedSelections: readonly LocationFieldValue[] = [],
  initialKeywordDraft = "",
): OnboardingDraft {
  const projectId = projectIdFor(project, flowState);
  const locations = [...(flowState.locations ?? [DEFAULT_ONBOARDING_LOCATION_KEY])];
  const locationSelections = locations.map(
    (key) =>
      storedSelections.find((selection) => selection.canonicalKey === key) ??
      locationValueForKey(key),
  );
  const defaultCountry = countryNameForLocationValue(
    locationSelections[0] ?? locationValueForKey(DEFAULT_ONBOARDING_LOCATION_KEY),
  );
  const devices = [...(flowState.devices ?? [project?.device ?? DEFAULT_ONBOARDING_DEVICE])];
  return {
    addKeywords: {
      device: devices[0] ?? DEFAULT_SERP_DEVICE,
      devices,
      keywords: initialKeywordDraft,
      locations,
      projectId,
    },
    connectProvider: {
      costPerCheck: 0,
      login: onboardingDefaults.apiLogin,
      projectId,
      providerId: flowState.providerId === "serpapi" ? "serpapi" : "dataforseo",
      secret: "",
    },
    createProject: {
      // ...defaultMatchingScopeValues, // Restore ownership matching with issue #863.
      website: project?.domain ?? initialWebsite,
    },
    schedule: {
      country: defaultCountry,
      cronExpression: project?.cronExpression ?? "0 6 * * *",
      device: devices[0] ?? DEFAULT_SERP_DEVICE,
      devices,
      frequency: project?.frequency ?? DEFAULT_ONBOARDING_FREQUENCY,
      jitterMinutes: project?.jitterMinutes ?? 60,
      serpDepth: project?.serpDepth ?? flowState.serpDepth,
      locationSelections,
      locations,
      projectId,
      timezone: project?.timezone ?? "UTC",
    },
  };
}
