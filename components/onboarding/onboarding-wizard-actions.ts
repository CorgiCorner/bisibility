import type { StepAddKeywords } from "@/components/onboarding/steps/StepAddKeywords";
import type { StepConnectGscCard } from "@/components/onboarding/steps/StepConnectGscCard";
import type { StepConnectProvider } from "@/components/onboarding/steps/StepConnectProvider";
import type { StepCreateProject } from "@/components/onboarding/steps/StepCreateProject";
import type { StepFirstCheck } from "@/components/onboarding/steps/StepFirstCheck";
import type { StepSchedule } from "@/components/onboarding/steps/StepSchedule";
import type { IssuedApiKey } from "@/components/settings/api-keys/api-key-model";
import type { SyncProjectTrafficInput } from "@/lib/actions/traffic-sync";
import type { IssueApiKeyInput } from "@/lib/schemas/apiKey";

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
  // Sample-data loader mounted in the wizard footer (step 1), not on a step component.
  installSampleDataAction: () => Promise<unknown>;
  importTopQueriesAction: NonNullable<
    Parameters<typeof StepAddKeywords>[0]["importTopQueriesAction"]
  >;
  fetchRankedKeywordSuggestionsAction: NonNullable<
    Parameters<typeof StepAddKeywords>[0]["fetchRankedKeywordSuggestionsAction"]
  >;
  issueApiKeyAction: (input: IssueApiKeyInput) => Promise<IssuedApiKey>;
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
  // Restore ownership matching with issue #863:
  // saveMatchingScopeAction: NonNullable<
  //   Parameters<typeof StepCreateProject>[0]["saveMatchingScopeAction"]
  // >;
  syncProjectTrafficAction: (input: SyncProjectTrafficInput) => Promise<unknown>;
  testProviderConnectionAction: NonNullable<
    Parameters<typeof StepConnectProvider>[0]["testProviderConnectionAction"]
  >;
  updateProjectDefaultsAction: NonNullable<
    Parameters<typeof StepSchedule>[0]["updateProjectDefaultsAction"]
  >;
};
