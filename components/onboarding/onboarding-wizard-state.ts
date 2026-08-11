import {
  type OnboardingFlowState,
  type OnboardingStepNumber,
  onboardingDefaults,
} from "@/components/onboarding/onboarding-fixtures";
import type { AddKeywordsForm } from "@/components/onboarding/steps/StepAddKeywords";
import type { OnboardingConnectProviderInput } from "@/components/onboarding/steps/StepConnectProvider";
import type { CreateProjectFormValues } from "@/components/onboarding/steps/StepCreateProject";
import type { OnboardingTrackingDefaultsInput } from "@/components/onboarding/steps/StepSchedule";
import { DEFAULT_SERP_DEVICE, DEFAULT_SERP_MARKET } from "@/lib/serp/markets";
// Restore ownership matching with issue #863:
// import { defaultMatchingScopeValues } from "./MatchingScopeFields";
import { countryNameForLocationValue, locationValuesForKeys } from "./onboarding-location-field";
import { DEFAULT_ONBOARDING_LOCATION_KEY } from "./onboarding-locations";

export type OnboardingProject = {
  domain: string | null;
  id: string;
  isSample?: boolean;
  name: string;
  publicId: string;
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

export function initialReachableOnboardingStep(
  initialStep: OnboardingStepNumber,
  flowState: OnboardingFlowState,
): OnboardingStepNumber {
  return flowState.projectId && initialStep < 2 ? 2 : initialStep;
}

export function initialOnboardingDraft(
  project: OnboardingProject | null,
  flowState: OnboardingFlowState,
): OnboardingDraft {
  const projectId = projectIdFor(project, flowState);
  const locations = [...(flowState.locations ?? [DEFAULT_ONBOARDING_LOCATION_KEY])];
  const locationSelections = locationValuesForKeys(locations);
  const defaultCountry = locationSelections[0]
    ? countryNameForLocationValue(locationSelections[0])
    : DEFAULT_SERP_MARKET;
  const devices = [...(flowState.devices ?? [DEFAULT_SERP_DEVICE])];
  return {
    addKeywords: {
      device: devices[0] ?? DEFAULT_SERP_DEVICE,
      devices,
      keywords: "",
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
      domain: project?.domain ?? "",
      name: project?.name ?? "",
    },
    schedule: {
      country: defaultCountry,
      cronExpression: "0 6 * * *",
      device: devices[0] ?? DEFAULT_SERP_DEVICE,
      devices,
      frequency: "daily",
      jitterMinutes: 60,
      locationSelections,
      locations,
      projectId,
      timezone: "UTC",
    },
  };
}
