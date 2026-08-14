"use client";

import {
  buildOnboardingStepHref,
  type OnboardingFlowState,
  type OnboardingStepNumber,
} from "@/components/onboarding/onboarding-fixtures";
import type { OnboardingWizardActions } from "@/components/onboarding/onboarding-wizard-actions";
import type {
  OnboardingDraft,
  OnboardingProject,
} from "@/components/onboarding/onboarding-wizard-state";
import { StepAddKeywords } from "@/components/onboarding/steps/StepAddKeywords";
import {
  StepConnectGscCard,
  StepConnectGscSetupNotice,
} from "@/components/onboarding/steps/StepConnectGscCard";
import { StepConnectProvider } from "@/components/onboarding/steps/StepConnectProvider";
import type { ConnectedProviderMap } from "@/components/onboarding/steps/StepConnectProvider.fields";
import { StepCreateProject } from "@/components/onboarding/steps/StepCreateProject";
import { StepFirstCheck } from "@/components/onboarding/steps/StepFirstCheck";
import type { GoogleOAuthSetup } from "@/lib/integrations/types";
import type { RankedKeywordConnection } from "@/lib/ranked-keywords/service";

export type OnboardingWizardStepsProps = {
  actions: OnboardingWizardActions;
  currentStep: OnboardingStepNumber;
  connectedProviderId?: string | null;
  dataResidencyMessage: string;
  draft: OnboardingDraft;
  flowState: OnboardingFlowState;
  gscJustConnected: boolean;
  gscGoogleOAuth?: GoogleOAuthSetup | null;
  gscOAuthConfigured: boolean;
  gscPropertyLabel?: string | null;
  hasAnalyticsSource: boolean;
  hasConnectedProvider: boolean;
  initialSerpConnections?: ConnectedProviderMap;
  keywordCount: number;
  monthlyCapCents: number;
  project: OnboardingProject | null;
  projectedCostPerCheckCents: number | null;
  rankedKeywordConnections: RankedKeywordConnection[];
  onCreateProjectComplete: NonNullable<Parameters<typeof StepCreateProject>[0]["onComplete"]>;
  onKeywordsChange: NonNullable<Parameters<typeof StepAddKeywords>[0]["onKeywordsChange"]>;
  onMarketsChange: NonNullable<Parameters<typeof StepAddKeywords>[0]["onMarketsChange"]>;
  onKeywordsComplete: NonNullable<Parameters<typeof StepAddKeywords>[0]["onComplete"]>;
  onProviderComplete: NonNullable<Parameters<typeof StepConnectProvider>[0]["onComplete"]>;
  onProviderContinueDisabledChange: NonNullable<
    Parameters<typeof StepConnectProvider>[0]["onContinueDisabledChange"]
  >;
  onProviderSkip: NonNullable<Parameters<typeof StepConnectProvider>[0]["onSkip"]>;
  onFirstCheckBack?: () => void;
  onTimezoneChange?: (timezone: string) => Promise<void> | void;
};

export function OnboardingWizardSteps({
  actions,
  currentStep,
  connectedProviderId,
  dataResidencyMessage,
  draft,
  flowState,
  gscJustConnected,
  gscGoogleOAuth,
  gscOAuthConfigured,
  gscPropertyLabel,
  hasAnalyticsSource,
  hasConnectedProvider,
  initialSerpConnections,
  keywordCount,
  monthlyCapCents,
  project,
  projectedCostPerCheckCents,
  rankedKeywordConnections,
  onCreateProjectComplete,
  onKeywordsChange,
  onMarketsChange,
  onKeywordsComplete,
  onProviderComplete,
  onProviderContinueDisabledChange,
  onProviderSkip,
  onFirstCheckBack,
  onTimezoneChange,
}: Readonly<OnboardingWizardStepsProps>) {
  return (
    <>
      {currentStep === 1 ? (
        <>
          {/* Restore ownership matching with issue #863:
          saveMatchingScopeAction={actions.saveMatchingScopeAction}
          */}
          <StepCreateProject
            createProjectAction={actions.createProjectAction}
            dataResidencyMessage={dataResidencyMessage}
            defaultValues={draft.createProject}
            deriveWebsiteAction={actions.deriveWebsiteAction}
            flowState={flowState}
            initialProject={project}
            onComplete={onCreateProjectComplete}
          />
        </>
      ) : null}
      {currentStep === 2 ? (
        <StepConnectProvider
          analyticsNotice={<StepConnectGscSetupNotice configured={gscOAuthConfigured} />}
          analyticsOption={
            <StepConnectGscCard
              completePropertySelection={actions.completeGooglePropertySelectionAction}
              configured={gscOAuthConfigured}
              connectedPropertyLabel={gscPropertyLabel}
              googleOAuth={gscGoogleOAuth}
              justConnected={gscJustConnected}
              loadStoredProperties={actions.loadStoredGooglePropertiesAction}
              projectId={project?.publicId ?? flowState.projectId}
              returnPath={buildOnboardingStepHref(2, flowState)}
              saveStoredProperty={actions.saveStoredGooglePropertyAction}
            />
          }
          connectProviderAction={actions.connectProviderAction}
          defaultValues={draft.connectProvider}
          flowState={flowState}
          initialConnections={initialSerpConnections}
          onComplete={onProviderComplete}
          onContinueDisabledChange={onProviderContinueDisabledChange}
          onSkip={onProviderSkip}
          testProviderConnectionAction={actions.testProviderConnectionAction}
        />
      ) : null}
      {currentStep === 3 ? (
        <StepAddKeywords
          addKeywordsAction={actions.addKeywordsAction}
          awaitingPropertySelection={Boolean(gscGoogleOAuth)}
          costPerCheckCents={projectedCostPerCheckCents}
          defaultValues={draft.addKeywords}
          fetchRankedKeywordSuggestionsAction={actions.fetchRankedKeywordSuggestionsAction}
          flowState={flowState}
          hasAnalyticsSource={hasAnalyticsSource}
          importTopQueriesAction={actions.importTopQueriesAction}
          monthlyCapCents={monthlyCapCents}
          onComplete={onKeywordsComplete}
          onKeywordsChange={onKeywordsChange}
          onMarketsChange={onMarketsChange}
          projectDomain={project?.domain ?? undefined}
          rankedKeywordConnections={rankedKeywordConnections}
          saveMarketsAction={actions.saveMarketsAction}
          trackingDefaults={draft.schedule}
          updateProjectDefaultsAction={actions.updateProjectDefaultsAction}
        />
      ) : null}
      {currentStep === 4 ? (
        <StepFirstCheck
          completeOnboardingAction={actions.completeOnboardingAction}
          defaults={draft.schedule}
          flowState={flowState}
          getObservedPositionsAction={actions.getObservedPositionsAction}
          hasAnalyticsSource={hasAnalyticsSource}
          keywordCount={keywordCount}
          keywordDraft={draft.addKeywords.keywords}
          listFirstCheckCandidatesAction={actions.listFirstCheckCandidatesAction}
          project={project}
          providerConnected={hasConnectedProvider}
          providerId={connectedProviderId}
          runFirstCheckPreviewAction={actions.runFirstCheckPreviewAction}
          saveMarketsAction={actions.saveMarketsAction}
          onBack={onFirstCheckBack}
          onTimezoneChange={onTimezoneChange}
        />
      ) : null}
    </>
  );
}
