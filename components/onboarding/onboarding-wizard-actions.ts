import type { StepAddKeywords } from "@/components/onboarding/steps/StepAddKeywords";
import type { StepConnectGscCard } from "@/components/onboarding/steps/StepConnectGscCard";
import type { StepConnectProvider } from "@/components/onboarding/steps/StepConnectProvider";
import type { StepCreateProject } from "@/components/onboarding/steps/StepCreateProject";
import type { StepFirstCheck } from "@/components/onboarding/steps/StepFirstCheck";
import type { SyncProjectTrafficInput } from "@/lib/actions/traffic-sync";
import type { ProjectDefaultsInput } from "@/lib/schemas/project";

export type OnboardingWizardActions = {
  addKeywordsAction: NonNullable<Parameters<typeof StepAddKeywords>[0]["addKeywordsAction"]>;
  connectProviderAction: NonNullable<
    Parameters<typeof StepConnectProvider>[0]["connectProviderAction"]
  >;
  completeGooglePropertySelectionAction: NonNullable<
    Parameters<typeof StepConnectGscCard>[0]["completePropertySelection"]
  >;
  completeOnboardingAction: NonNullable<
    Parameters<typeof StepFirstCheck>[0]["completeOnboardingAction"]
  >;
  createProjectAction: NonNullable<Parameters<typeof StepCreateProject>[0]["createProjectAction"]>;
  deriveWebsiteAction: NonNullable<Parameters<typeof StepCreateProject>[0]["deriveWebsiteAction"]>;
  // Sample-data loader mounted in the wizard footer (step 1), not on a step component.
  installSampleDataAction: () => Promise<unknown>;
  loadStoredGooglePropertiesAction: NonNullable<
    Parameters<typeof StepConnectGscCard>[0]["loadStoredProperties"]
  >;
  importTopQueriesAction: NonNullable<
    Parameters<typeof StepAddKeywords>[0]["importTopQueriesAction"]
  >;
  fetchRankedKeywordSuggestionsAction: NonNullable<
    Parameters<typeof StepAddKeywords>[0]["fetchRankedKeywordSuggestionsAction"]
  >;
  getObservedPositionsAction: NonNullable<
    Parameters<typeof StepFirstCheck>[0]["getObservedPositionsAction"]
  >;
  listFirstCheckCandidatesAction: NonNullable<
    Parameters<typeof StepFirstCheck>[0]["listFirstCheckCandidatesAction"]
  >;
  queueFirstChecksAction: NonNullable<
    Parameters<typeof StepFirstCheck>[0]["queueFirstChecksAction"]
  >;
  runFirstCheckPreviewAction: NonNullable<
    Parameters<typeof StepFirstCheck>[0]["runFirstCheckPreviewAction"]
  >;
  saveStoredGooglePropertyAction: NonNullable<
    Parameters<typeof StepConnectGscCard>[0]["saveStoredProperty"]
  >;
  // Restore ownership matching with issue #863:
  // saveMatchingScopeAction: NonNullable<
  //   Parameters<typeof StepCreateProject>[0]["saveMatchingScopeAction"]
  // >;
  syncProjectTrafficAction: (input: SyncProjectTrafficInput) => Promise<unknown>;
  testProviderConnectionAction: NonNullable<
    Parameters<typeof StepConnectProvider>[0]["testProviderConnectionAction"]
  >;
  updateProjectDefaultsAction: (input: ProjectDefaultsInput) => Promise<unknown>;
};
